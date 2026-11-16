/**
 * The background tones the player loops underneath a track.
 *
 * ## Why this exists
 *
 * A Bluetooth sink that hears digital silence long enough powers down its link,
 * and the word after the pause is lost while it comes back. A floor of sound
 * that never stops is the cure. "Room tone" is the audio world's own name for
 * the noise a room already has; the others are the same idea with a place
 * attached, because a listener who has to leave something playing for an hour
 * would rather it sounded like rain than like a hiss.
 *
 * ## Generated versus recorded
 *
 * **Room tone is synthesised** (`buildRoomToneWav`). That is not a compromise:
 * room tone *is* noise, and a deterministic buffer is smaller, retunable, and
 * testable in a way a binary is not. It loops by repeating, because for noise a
 * crossfade would dip the level once per loop — audible — while the seam it
 * would hide is a step between two random values, indistinguishable from the
 * noise itself.
 *
 * **Everything else is a real recording**, because that is the whole point of
 * them. Filtered white noise does not sound like a forest; it sounds like
 * filtered white noise, and a listener who chose "Forest" to mask a room can
 * hear the difference within seconds. The six files in `assets/tones/` are
 * field recordings, each normalised to the same RMS and each cut into a
 * seamless loop by `scripts/build-tones.sh` — the loop point is a crossfade of
 * the tail into the head, and the seam is verified against the surrounding
 * waveform rather than assumed.
 *
 * ## Loudness
 *
 * Every tone is normalised to the same RMS rather than the same peak, because
 * they have different crest factors: rain's droplets spike far above their bed,
 * and a peak-normalised rain would sit several decibels under a peak-normalised
 * room. The player then scales that one figure (see `roomToneAmplitude`), so a
 * given percentage sounds equally loud whichever tone is chosen.
 *
 * ## Licensing
 *
 * Every recording is CC0, CC BY or CC BY-SA, and `TONE_CREDITS` carries the
 * attribution the latter two require. Nothing here is "free to use" by
 * assumption — each file was checked on the page that hosts it.
 */

/** 22.05 kHz is plenty for a room's noise and halves the generated file. */
export const TONE_SAMPLE_RATE = 22050;

export type AmbientToneId =
  | "room"
  | "rain"
  | "forest"
  | "river"
  | "ocean"
  | "wind"
  | "birds";

/** Where a tone's audio comes from. */
export type ToneKind = "generated" | "recorded";

export type AmbientTone = {
  id: AmbientToneId;
  kind: ToneKind;
  /** What the tone is called, in the listener's words. */
  label: string;
  /** One line saying what it sounds like, for the picker. */
  hint: string;
  /**
   * Length of a generated loop, in seconds. Long enough that the repeat is not
   * a rhythm. Recorded tones state their length in the credit instead, because
   * it is a property of the file rather than of the code.
   */
  seconds?: number;
  /** Seed for the noise, so the same build always produces the same bytes. */
  seed?: number;
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
    kind: "generated",
    label: "Room",
    hint: "The faint hiss a quiet room already has.",
    seconds: 4,
    seed: 0x9e3779b9,
  },
  {
    id: "rain",
    kind: "recorded",
    label: "Rain",
    hint: "Rain falling on leaves.",
  },
  {
    id: "forest",
    kind: "recorded",
    label: "Forest",
    hint: "A deciduous wood, with birds moving through it.",
  },
  {
    id: "river",
    kind: "recorded",
    label: "River",
    hint: "Water running fast over stones.",
  },
  {
    id: "ocean",
    kind: "recorded",
    label: "Ocean",
    hint: "Waves breaking on a beach and drawing back.",
  },
  {
    id: "wind",
    kind: "recorded",
    label: "Wind",
    hint: "A steady wind, with no edges to it.",
  },
  {
    id: "birds",
    kind: "recorded",
    label: "Birds",
    hint: "A dawn chorus, many birds at once.",
  },
];

/**
 * The recordings, as Metro asset modules.
 *
 * `require` is static on purpose: Metro resolves these at build time, so the
 * files ship inside the app and a tone works with the phone in aeroplane mode.
 * A URL would have made the one feature that exists for offline listening the
 * one feature that needs a network.
 */
const RECORDINGS: Partial<Record<AmbientToneId, number>> = {
  rain: require("../../assets/tones/rain.mp3"),
  forest: require("../../assets/tones/forest.mp3"),
  river: require("../../assets/tones/river.mp3"),
  ocean: require("../../assets/tones/ocean.mp3"),
  wind: require("../../assets/tones/wind.mp3"),
  birds: require("../../assets/tones/birds.mp3"),
};

/** The asset module for a recorded tone, or null for a generated one. */
export function toneAsset(id: AmbientToneId): number | null {
  return RECORDINGS[id] ?? null;
}

/**
 * Who made each recording, and under what licence.
 *
 * CC BY and CC BY-SA both require attribution, so it travels with the app
 * rather than living in a commit message. `work` is the file's own title on
 * Wikimedia Commons, which is how a reader can find it again.
 */
export type ToneCredit = {
  work: string;
  artist: string;
  licence: string;
};

export const TONE_CREDITS: Partial<Record<AmbientToneId, ToneCredit>> = {
  rain: { work: "Rain on leaves", artist: "Gravity Sound", licence: "CC BY 4.0" },
  forest: { work: "2020-04-28 deciduous forest", artist: "Strebo7", licence: "CC BY-SA 4.0" },
  river: { work: "James River Rapids 1", artist: "Jarrod Stanley", licence: "CC0" },
  ocean: { work: "Ocean Waves on a Tropical Beach", artist: "Jarrod Stanley", licence: "CC0" },
  wind: { work: "Windy day", artist: "Gravity Sound", licence: "CC BY 4.0" },
  birds: {
    work: "Dawn chorus at Glencairnie, Craigmore",
    artist: "DivyaCM",
    licence: "CC BY 4.0",
  },
};

/** The line the picker shows under the list, or null when nothing is owed. */
export function describeCredits(): string {
  return Object.values(TONE_CREDITS)
    .map((credit) => `${credit.work} — ${credit.artist} (${credit.licence})`)
    .join(" · ");
}

export const DEFAULT_TONE_ID: AmbientToneId = "room";

export function findTone(id: string | null | undefined): AmbientTone | null {
  return TONES.find((tone) => tone.id === id) ?? null;
}

/**
 * Coerces a stored or chosen id into one this build can play.
 *
 * A tone removed from the catalogue must degrade to the default rather than
 * leave the player with a file name nothing generates. This is also what
 * carries a listener who had the old synthetic "waves" over to the default
 * rather than leaving them with a tone that no longer exists.
 */
export function parseToneId(value: string | null | undefined): AmbientToneId {
  return findTone(value)?.id ?? DEFAULT_TONE_ID;
}

/** Where a generated tone's bytes live in the cache. Regenerable, so reclaimable. */
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
 * bed itself ending up inaudible under the recording. The recorded files are
 * built to the same figure by `scripts/build-tones.sh`.
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

export type ToneOptions = {
  sampleRate?: number;
  seconds?: number;
  seed?: number;
};

/**
 * A mono 16-bit PCM WAV of the room tone.
 *
 * The samples are generated in floating point, de-meaned, normalised to the
 * shared RMS, and only then quantised: normalising after the conversion to
 * `Int16` would leave the buffer clipping at whatever the loudest single sample
 * happened to be.
 */
export function buildRoomToneWav(options: ToneOptions = {}): Uint8Array {
  const tone = findTone(DEFAULT_TONE_ID) as AmbientTone;
  const sampleRate = Math.max(8000, Math.round(options.sampleRate ?? TONE_SAMPLE_RATE));
  const seconds = Math.max(1, options.seconds ?? tone.seconds ?? 4);
  const sampleCount = Math.round(sampleRate * seconds);
  const samples = new Float32Array(sampleCount);

  renderRoom({
    sampleRate,
    seconds,
    random: createRandom(options.seed ?? tone.seed ?? 0),
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

function writeAscii(buffer: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    buffer[offset + i] = text.charCodeAt(i);
  }
}
