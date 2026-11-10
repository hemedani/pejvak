/**
 * The room tone the player loops underneath a track.
 *
 * ## Why the file is generated instead of shipped
 *
 * It is noise. A 176 KB binary in the repository would be a blob nobody can
 * read, diff or retune, and it would still have to be copied to the cache before
 * the player could loop it. Generating it costs a few milliseconds once per
 * install, is deterministic, and keeps the one thing that matters — how loud it
 * is and how it is shaped — in code with a test beside it.
 *
 * ## Why it loops without a crossfade
 *
 * The obvious seam treatment is to fade the tail into the head. For noise that is
 * the wrong move twice over: a fade makes the level dip once per loop, which is
 * *audible* as a periodic pulse, while the discontinuity it was meant to hide is
 * a step between two random values — indistinguishable from the noise itself.
 * So the buffer simply repeats.
 *
 * ## What it sounds like
 *
 * White noise with the top end taken off, which is what makes it read as a room
 * rather than as a hiss. It is never heard on its own: at the levels the player
 * uses (see `roomToneAmplitude`) it sits below the recording, doing nothing
 * except keeping the output stream from going to digital silence.
 */

/** 22.05 kHz is plenty for a hiss and halves the file. */
export const ROOM_TONE_SAMPLE_RATE = 22050;

/** Four seconds — long enough that the repeat is not a rhythm. */
export const ROOM_TONE_SECONDS = 4;

/** Lives in the cache: it is regenerable, and the system may reclaim it. */
export const ROOM_TONE_FILE_NAME = "room-tone.wav";

/** Low-pass corner. Above this the noise turns hissy and cheap. */
const LOWPASS_HZ = 4500;

/**
 * Peak of the finished buffer.
 *
 * Not 1.0: `player.volume` scales this buffer, and a full-scale noise source
 * leaves no headroom for the mapping in `roomToneAmplitude` to stay linear.
 */
const TARGET_PEAK = 0.7;

const BYTES_PER_SAMPLE = 2;

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

export type RoomToneOptions = {
  sampleRate?: number;
  seconds?: number;
  seed?: number;
};

/**
 * A mono 16-bit PCM WAV of softly filtered noise.
 *
 * The samples are generated in floating point, de-meaned, normalised, and only
 * then quantised: normalising after the conversion to `Int16` would leave the
 * buffer clipping at whatever the loudest single sample happened to be.
 */
export function buildRoomToneWav(options: RoomToneOptions = {}): Uint8Array {
  const sampleRate = Math.max(8000, Math.round(options.sampleRate ?? ROOM_TONE_SAMPLE_RATE));
  const seconds = Math.max(1, options.seconds ?? ROOM_TONE_SECONDS);
  const random = createRandom(options.seed ?? 0x9e3779b9);

  const sampleCount = Math.round(sampleRate * seconds);
  const samples = new Float32Array(sampleCount);

  // One-pole low-pass: `a` is the per-sample coefficient for the corner.
  const a = 1 - Math.exp((-2 * Math.PI * LOWPASS_HZ) / sampleRate);
  let filtered = 0;
  let sum = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const white = random() * 2 - 1;
    filtered += a * (white - filtered);
    // Mostly the filtered signal, with a little of the raw noise kept for air.
    const value = filtered * 0.8 + white * 0.2;
    samples[i] = value;
    sum += value;
  }

  // Digital silence is what the noise exists to prevent, so a DC offset is the
  // one thing this buffer must not have: it would bias every sample toward one
  // side and eat the headroom the peak normalisation needs.
  const mean = sum / sampleCount;
  let peak = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const value = samples[i] - mean;
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }

  const gain = peak > 0 ? TARGET_PEAK / peak : 0;
  const dataBytes = sampleCount * BYTES_PER_SAMPLE;
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

  for (let i = 0; i < sampleCount; i += 1) {
    const scaled = Math.max(-1, Math.min(1, samples[i] * gain));
    view.setInt16(44 + i * BYTES_PER_SAMPLE, Math.round(scaled * 32767), true);
  }

  return buffer;
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    target[offset + i] = text.charCodeAt(i);
  }
}
