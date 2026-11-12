/**
 * The background tones the player loops underneath a track.
 *
 * ## Why this exists
 *
 * A Bluetooth sink that hears digital silence long enough powers down its link,
 * and the word after the pause is lost while it comes back. A floor of sound
 * that never stops is the cure. "Room tone" is the audio world's own name for
 * the noise a room already has; the others here are the same idea with a place
 * attached, because a listener who has to leave the hiss on for an hour would
 * rather it sounded like rain than like a hiss.
 *
 * ## Why the files are generated instead of shipped
 *
 * Each one is a few hundred kilobytes of noise. Five binaries in the repository
 * would be blobs nobody can read, diff or retune, and they would still have to
 * be copied to the cache before the player could loop them. Generating them
 * costs a few milliseconds once per install, is deterministic, and keeps the
 * one thing that matters — how each is shaped and how loud it is — in code with
 * a test beside it.
 *
 * ## Why they loop without a crossfade
 *
 * The obvious seam treatment is to fade the tail into the head. For noise that
 * is the wrong move twice over: a fade makes the level dip once per loop, which
 * is *audible* as a periodic pulse, while the discontinuity it was meant to hide
 * is a step between two random values — indistinguishable from the noise
 * itself. So the buffer simply repeats. Everything that is *not* noise — a
 * swell, a gust, a shower's intensity — is built from whole cycles of the
 * buffer, so the level at the seam is the level after it.
 *
 * ## Loudness
 *
 * Every tone is normalised to the same RMS rather than the same peak, because
 * the five have different crest factors: rain's droplets spike far above their
 * bed, and a peak-normalised rain would sit several decibels under a
 * peak-normalised room. The player then scales that one figure (see
 * `roomToneAmplitude`), so a given percentage sounds equally loud whichever
 * tone is chosen.
 */

/** 22.05 kHz is plenty for ambience and halves the file. */
export const TONE_SAMPLE_RATE = 22050;

export type AmbientToneId = "room" | "rain" | "forest" | "waves" | "wind";

export type AmbientTone = {
  id: AmbientToneId;
  /** What the tone is called, in the listener's words. */
  label: string;
  /** One line saying what it sounds like, for the picker. */
  hint: string;
  /** Length of the loop, in seconds. Long enough that the repeat is not a rhythm. */
  seconds: number;
  /** Seed for the noise, so the same build always produces the same bytes. */
  seed: number;
};

/**
 * The catalogue, in the order the picker offers it.
 *
 * Room first: it is the original, it is the one that is not a *place*, and a
 * listener who does not want to choose should not have to.
 */
export const TONES: readonly AmbientTone[] = [
  {
    id: "room",
    label: "Room",
    hint: "The faint hiss a quiet room already has.",
    seconds: 4,
    seed: 0x9e3779b9,
  },
  {
    id: "rain",
    label: "Rain",
    hint: "Steady rain on a window, with the odd heavier drop.",
    seconds: 6,
    seed: 0x1f123bb5,
  },
  {
    id: "forest",
    label: "Forest",
    hint: "Leaves and air, and a bird every few seconds.",
    seconds: 8,
    seed: 0x51ed270b,
  },
  {
    id: "waves",
    label: "Waves",
    hint: "Slow surf, swelling and drawing back.",
    seconds: 12,
    seed: 0x2545f491,
  },
  {
    id: "wind",
    label: "Wind",
    hint: "A draught rising and falling, with no edges.",
    seconds: 10,
    seed: 0x6a09e667,
  },
];

export const DEFAULT_TONE_ID: AmbientToneId = "room";

export function findTone(id: string | null | undefined): AmbientTone | null {
  return TONES.find((tone) => tone.id === id) ?? null;
}

/**
 * Coerces a stored or chosen id into one this build can play.
 *
 * A tone removed from the catalogue must degrade to the default rather than
 * leave the player with a file name nothing generates.
 */
export function parseToneId(value: string | null | undefined): AmbientToneId {
  return findTone(value)?.id ?? DEFAULT_TONE_ID;
}

/** Where a tone's bytes live in the cache. Regenerable, so reclaimable. */
export function toneFileName(id: AmbientToneId): string {
  return `tone-${id}.wav`;
}

/**
 * Peak of the finished buffer.
 *
 * Not 1.0: `player.volume` scales this buffer, and a full-scale source leaves no
 * headroom for the mapping in `roomToneAmplitude` to stay linear.
 */
const PEAK_CEILING = 0.98;

/**
 * Loudness every tone is normalised to, as RMS in full-scale units — roughly
 * −18 dBFS. Chosen so a droplet or a bird can spike above the bed without the
 * bed itself ending up inaudible under the recording.
 */
const TARGET_RMS = 0.12;

/**
 * The same figure as decibels, which is the unit the player's volume mapping
 * works in: a level asked for in dBFS is one subtraction away from the linear
 * amplitude that produces it from this buffer.
 */
export const TONE_TARGET_RMS_DB = 20 * Math.log10(TARGET_RMS);

const BYTES_PER_SAMPLE = 2;
const TWO_PI = Math.PI * 2;

/**
 * Deterministic PRNG (mulberry32).
 *
 * A seeded generator, not `Math.random`, so the same build always produces the
 * same bytes and a test can assert on them.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-sample coefficient for a one-pole low-pass at `cutoffHz`. */
function onePole(cutoffHz: number, sampleRate: number): number {
  return 1 - Math.exp((-TWO_PI * cutoffHz) / sampleRate);
}

type RenderContext = {
  sampleRate: number;
  seconds: number;
  random: () => number;
  out: Float32Array;
};

/** A single decaying sine — one rain drop. */
type Drop = {
  phase: number;
  increment: number;
  amplitude: number;
  decay: number;
};

function strike(drop: Drop, random: () => number, sampleRate: number): void {
  const hz = 900 + random() * 2700;
  drop.phase = 0;
  drop.increment = (TWO_PI * hz) / sampleRate;
  drop.amplitude = 0.35 + random() * 0.5;
  // −60 dB in about 20 ms: a click with a body, not a tone.
  drop.decay = Math.exp(-1 / (0.02 * sampleRate));
}

/** The noise a room already has: white noise with the top end taken off. */
function renderRoom({ sampleRate, out, random }: RenderContext): void {
  const a = onePole(4500, sampleRate);
  let filtered = 0;
  for (let i = 0; i < out.length; i += 1) {
    const white = random() * 2 - 1;
    filtered += a * (white - filtered);
    // Mostly the filtered signal, with a little of the raw noise kept for air.
    out[i] = filtered * 0.8 + white * 0.2;
  }
}

/**
 * Rain: a band of hiss for the sheet of water, plus sparse droplets on top.
 *
 * The shower's intensity breathes over two whole cycles of the loop, so the
 * level at the seam is the level after it — a swell that did not close would
 * click once per repeat, which is exactly the pulse a crossfade would have
 * caused.
 */
function renderRain({ sampleRate, random, out }: RenderContext): void {
  const hi = onePole(8000, sampleRate);
  const lo = onePole(1200, sampleRate);
  let lpHi = 0;
  let lpLo = 0;

  const drops: Drop[] = Array.from({ length: 3 }, () => ({
    phase: 0,
    increment: 0,
    amplitude: 0,
    decay: 0,
  }));
  let next = 0;
  // ~45 drops a second: a shower, not a tap.
  const perSample = 45 / sampleRate;
  const tail = Math.round(0.04 * sampleRate);

  for (let i = 0; i < out.length; i += 1) {
    const white = random() * 2 - 1;
    lpHi += hi * (white - lpHi);
    lpLo += lo * (white - lpLo);
    const band = lpHi - lpLo;

    const t = i / out.length;
    const shower = 0.85 + 0.15 * Math.sin(TWO_PI * 2 * t - Math.PI / 2);

    let value = band * 0.5 * shower;

    // No new drop in the last few milliseconds: a decay cut off by the loop
    // point is the one click this buffer can produce.
    if (i < out.length - tail && random() < perSample) {
      strike(drops[next] as Drop, random, sampleRate);
      next = (next + 1) % drops.length;
    }
    for (const drop of drops) {
      if (drop.amplitude < 1e-4) {
        continue;
      }
      value += Math.sin(drop.phase) * drop.amplitude * 0.35;
      drop.phase += drop.increment;
      drop.amplitude *= drop.decay;
    }

    out[i] = value;
  }
}

type Note = {
  startSample: number;
  lengthSamples: number;
  fromHz: number;
  toHz: number;
  gain: number;
};

/**
 * Forest: a low bed of moving air, a little leaf rustle, and three birds.
 *
 * The birds are placed inside the loop with a margin at both ends, because a
 * chirp sliced by the repeat is a click, and the whole point of the loop is that
 * nothing marks it.
 */
function renderForest({ sampleRate, seconds, random, out }: RenderContext): void {
  const bed = onePole(700, sampleRate);
  const rustleHi = onePole(6000, sampleRate);
  const rustleLo = onePole(1800, sampleRate);
  let lpBed = 0;
  let lpRustleHi = 0;
  let lpRustleLo = 0;

  for (let i = 0; i < out.length; i += 1) {
    const white = random() * 2 - 1;
    lpBed += bed * (white - lpBed);
    lpRustleHi += rustleHi * (white - lpRustleHi);
    lpRustleLo += rustleLo * (white - lpRustleLo);

    const t = i / out.length;
    // Three gusts and five rustles, both whole cycles of the buffer.
    const gust = 0.75 + 0.25 * (0.5 - 0.5 * Math.cos(TWO_PI * 3 * t));
    const rustle = 0.5 + 0.5 * Math.sin(TWO_PI * 5 * t);

    out[i] = lpBed * 0.55 * gust + (lpRustleHi - lpRustleLo) * 0.09 * rustle;
  }

  // Three birds, each a short phrase of rising notes.
  const phrases = [0.12, 0.46, 0.79];
  for (const phrase of phrases) {
    const notes = 3 + Math.floor(random() * 3);
    const base = 2400 + random() * 900;
    const noteLength = 0.055 + random() * 0.035;
    const spacing = 0.1 + random() * 0.05;
    for (let note = 0; note < notes; note += 1) {
      const start = Math.round((phrase + note * spacing) * seconds * sampleRate);
      const length = Math.round(noteLength * sampleRate);
      if (start + length >= out.length) {
        break;
      }
      // Each note rises: a chirp, not a beep.
      const from = base * (1 + note * 0.06);
      const to = from * (1.18 + random() * 0.12);
      addTone(out, sampleRate, {
        startSample: start,
        lengthSamples: length,
        fromHz: from,
        toHz: to,
        gain: 0.16,
      });
    }
  }
}

/** Adds one gliding, softly enveloped note into the buffer. */
function addTone(out: Float32Array, sampleRate: number, note: Note): void {
  let phase = 0;
  for (let i = 0; i < note.lengthSamples; i += 1) {
    const index = note.startSample + i;
    if (index >= out.length) {
      return;
    }
    const u = i / note.lengthSamples;
    const hz = note.fromHz + (note.toHz - note.fromHz) * u;
    phase += (TWO_PI * hz) / sampleRate;
    // A sine bell: no attack click, no tail click.
    const envelope = Math.sin(Math.PI * u) ** 1.4;
    out[index] = (out[index] ?? 0) + Math.sin(phase) * envelope * note.gain;
  }
}

/**
 * Waves: a low rumble that swells and draws back, with foam on the crest.
 *
 * Two swells over twelve seconds — six seconds each, which is roughly the period
 * of surf on a shore, and long enough that the repeat is not heard as a rhythm.
 */
function renderWaves({ sampleRate, random, out }: RenderContext): void {
  const rumble = onePole(1100, sampleRate);
  const foam = onePole(2500, sampleRate);
  let lpRumble = 0;
  let lpFoam = 0;

  for (let i = 0; i < out.length; i += 1) {
    const white = random() * 2 - 1;
    lpRumble += rumble * (white - lpRumble);
    lpFoam += foam * (white - lpFoam);

    const t = i / out.length;
    const swell = 0.5 - 0.5 * Math.cos(TWO_PI * 2 * t);
    const body = 0.3 + 0.7 * swell ** 1.6;
    // The foam only exists at the crest, and rises faster than the body does.
    const crest = swell ** 3;

    out[i] = lpRumble * 0.7 * body + (white - lpFoam) * 0.16 * crest;
  }
}

/**
 * Wind: a band of moving air under a gust that rises and falls.
 *
 * The gust is two sines with a whole number of cycles each, so it closes on
 * itself; a real gust is random, but a random one cannot loop without a level
 * step at the seam.
 */
function renderWind({ sampleRate, random, out }: RenderContext): void {
  const hi = onePole(1400, sampleRate);
  const lo = onePole(200, sampleRate);
  let lpHi = 0;
  let lpLo = 0;

  for (let i = 0; i < out.length; i += 1) {
    const white = random() * 2 - 1;
    lpHi += hi * (white - lpHi);
    lpLo += lo * (white - lpLo);

    const t = i / out.length;
    const gust =
      0.55 +
      0.3 * Math.sin(TWO_PI * 1 * t - Math.PI / 2) +
      0.15 * Math.sin(TWO_PI * 3 * t);

    out[i] = (lpHi - lpLo) * 0.55 * Math.max(0.08, gust);
  }
}

const RENDERERS: Record<AmbientToneId, (context: RenderContext) => void> = {
  room: renderRoom,
  rain: renderRain,
  forest: renderForest,
  waves: renderWaves,
  wind: renderWind,
};

export type ToneOptions = {
  sampleRate?: number;
  seconds?: number;
  seed?: number;
};

/**
 * A mono 16-bit PCM WAV of the chosen tone.
 *
 * The samples are generated in floating point, de-meaned, normalised to a
 * shared RMS, and only then quantised: normalising after the conversion to
 * `Int16` would leave the buffer clipping at whatever the loudest single sample
 * happened to be.
 */
export function buildToneWav(id: AmbientToneId, options: ToneOptions = {}): Uint8Array {
  const tone = findTone(id) ?? (TONES[0] as AmbientTone);
  const sampleRate = Math.max(8000, Math.round(options.sampleRate ?? TONE_SAMPLE_RATE));
  const seconds = Math.max(1, options.seconds ?? tone.seconds);
  const sampleCount = Math.round(sampleRate * seconds);
  const samples = new Float32Array(sampleCount);

  RENDERERS[tone.id]({
    sampleRate,
    seconds,
    random: createRandom(options.seed ?? tone.seed),
    out: samples,
  });

  normalise(samples);
  return encodeWav(samples, sampleRate);
}

/**
 * Removes the DC offset and brings the buffer to the shared RMS.
 *
 * Digital silence is what the tone exists to prevent, so a DC offset is the one
 * thing this buffer must not have: it would bias every sample toward one side
 * and eat the headroom the normalisation needs.
 */
function normalise(samples: Float32Array): void {
  const count = samples.length;
  if (count === 0) {
    return;
  }

  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    sum += samples[i] as number;
  }
  const mean = sum / count;

  let energy = 0;
  let peak = 0;
  for (let i = 0; i < count; i += 1) {
    const value = (samples[i] as number) - mean;
    samples[i] = value;
    energy += value * value;
    peak = Math.max(peak, Math.abs(value));
  }

  const rms = Math.sqrt(energy / count);
  if (rms <= 0 || peak <= 0) {
    samples.fill(0);
    return;
  }

  // RMS first, then the ceiling: a tone whose transients would clip is scaled
  // down as a whole rather than flattened.
  const gain = Math.min(TARGET_RMS / rms, PEAK_CEILING / peak);
  for (let i = 0; i < count; i += 1) {
    samples[i] = (samples[i] as number) * gain;
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = new Uint8Array(44 + dataBytes);
  const view = new DataView(buffer.buffer);

  writeAscii(buffer, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(buffer, 8, "WAVE");
  writeAscii(buffer, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(buffer, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i += 1) {
    const scaled = Math.max(-1, Math.min(1, samples[i] as number));
    view.setInt16(44 + i * BYTES_PER_SAMPLE, Math.round(scaled * 32767), true);
  }

  return buffer;
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    target[offset + i] = text.charCodeAt(i);
  }
}
