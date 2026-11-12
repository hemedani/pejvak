/**
 * The generated background tones.
 *
 * A buffer is the one thing here that cannot be checked by eye, so the cases
 * assert the properties that matter: each file is one the player will accept,
 * it is not silence (the entire purpose), it has no DC offset, it is as loud as
 * the next tone so the slider means the same thing whichever is chosen, and it
 * is the same bytes every time so a change to a generator is a deliberate one.
 */

import {
  DEFAULT_TONE_ID,
  TONES,
  TONE_SAMPLE_RATE,
  TONE_TARGET_RMS_DB,
  buildToneWav,
  findTone,
  parseToneId,
  toneFileName,
  type AmbientToneId,
} from "@/lib/ambientTones";

const HEADER_BYTES = 44;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function samplesOf(wav: Uint8Array): Int16Array {
  return new Int16Array(wav.buffer, wav.byteOffset + HEADER_BYTES);
}

/** RMS of a slice, as a fraction of full scale. */
function rms(samples: Int16Array, from = 0, to = samples.length): number {
  let energy = 0;
  for (let i = from; i < to; i += 1) {
    const value = (samples[i] as number) / 32767;
    energy += value * value;
  }
  return Math.sqrt(energy / Math.max(1, to - from));
}

describe("the tone catalogue", () => {
  it("offers the room tone first, because it is the one that is not a place", () => {
    expect(TONES[0]?.id).toBe(DEFAULT_TONE_ID);
    expect(DEFAULT_TONE_ID).toBe("room");
  });

  it("has one entry per id, with a distinct label and seed each", () => {
    expect(new Set(TONES.map((tone) => tone.id)).size).toBe(TONES.length);
    expect(new Set(TONES.map((tone) => tone.label)).size).toBe(TONES.length);
    expect(new Set(TONES.map((tone) => tone.seed)).size).toBe(TONES.length);
    for (const tone of TONES) {
      expect(tone.label.length).toBeGreaterThan(0);
      expect(tone.hint.length).toBeGreaterThan(0);
      expect(tone.seconds).toBeGreaterThanOrEqual(1);
    }
  });

  it("names each file after its tone, so two tones never share a cache entry", () => {
    expect(toneFileName("rain")).toBe("tone-rain.wav");
    expect(new Set(TONES.map((tone) => toneFileName(tone.id))).size).toBe(TONES.length);
  });

  it("falls back to the default for an id this build cannot play", () => {
    expect(parseToneId("rain")).toBe("rain");
    expect(parseToneId("thunder")).toBe(DEFAULT_TONE_ID);
    expect(parseToneId(null)).toBe(DEFAULT_TONE_ID);
    expect(findTone("thunder")).toBeNull();
  });
});

describe.each(TONES.map((tone) => [tone.id, tone] as const))("buildToneWav(%s)", (id, tone) => {
  const wav = buildToneWav(id);
  const header = view(wav);
  const samples = samplesOf(wav);

  it("is a mono 16-bit PCM WAV the player will accept", () => {
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(header.getUint16(20, true)).toBe(1); // PCM
    expect(header.getUint16(22, true)).toBe(1); // mono
    expect(header.getUint32(24, true)).toBe(TONE_SAMPLE_RATE);
    expect(header.getUint16(34, true)).toBe(16);
  });

  it("declares the length it actually has", () => {
    const sampleCount = TONE_SAMPLE_RATE * tone.seconds;
    expect(wav.byteLength).toBe(HEADER_BYTES + sampleCount * 2);
    expect(header.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(header.getUint32(40, true)).toBe(sampleCount * 2);
  });

  it("is noise, not silence — the reason it exists", () => {
    const nonZero = samples.reduce((count, sample) => count + (sample !== 0 ? 1 : 0), 0);
    expect(nonZero).toBeGreaterThan(samples.length * 0.99);
  });

  it("has no DC offset, which would eat the headroom it normalises against", () => {
    const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(120); // ~0.4% of full scale
  });

  it("is as loud as every other tone, so one slider position means one level", () => {
    // Normalised to a shared RMS rather than a shared peak: rain's droplets and
    // the forest's birds spike well above their beds, and a peak-normalised
    // version of either would sit several decibels under the room tone.
    const db = 20 * Math.log10(rms(samples));
    expect(db).toBeGreaterThan(TONE_TARGET_RMS_DB - 2);
    expect(db).toBeLessThan(TONE_TARGET_RMS_DB + 1);
  });

  it("leaves headroom for the player's own volume to scale it", () => {
    const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    expect(peak).toBeGreaterThan(32767 * 0.2);
    expect(peak).toBeLessThanOrEqual(32767 * 0.99);
  });

  it("is deterministic for its seed", () => {
    // One second is enough to compare bytes, and keeps a case that renders
    // every tone from taking a second each.
    const short = buildToneWav(id, { seconds: 1 });
    expect(buildToneWav(id, { seconds: 1 }).slice(HEADER_BYTES, HEADER_BYTES + 64)).toEqual(
      short.slice(HEADER_BYTES, HEADER_BYTES + 64),
    );
    expect(
      buildToneWav(id, { seconds: 1, seed: 12345 }).slice(HEADER_BYTES, HEADER_BYTES + 64),
    ).not.toEqual(short.slice(HEADER_BYTES, HEADER_BYTES + 64));
  });

  it("honours a different sample rate and length", () => {
    const short = buildToneWav(id, { sampleRate: 8000, seconds: 1 });
    expect(view(short).getUint32(24, true)).toBe(8000);
    expect(short.byteLength).toBe(HEADER_BYTES + 8000 * 2);
  });

  it("does not repeat the same bytes as another tone", () => {
    const mine = buildToneWav(id, { seconds: 1 }).slice(HEADER_BYTES, HEADER_BYTES + 256);
    for (const other of TONES.filter((candidate) => candidate.id !== id)) {
      expect(buildToneWav(other.id, { seconds: 1 }).slice(HEADER_BYTES, HEADER_BYTES + 256)).not.toEqual(
        mine,
      );
    }
  });
});

describe("the loop seam", () => {
  /**
   * The buffers repeat with no crossfade, which is right for noise — but only
   * if the *envelope* closes. A swell or a gust that did not end where it began
   * would step once per loop, and a periodic step is audible in a way a step
   * between two random noise values is not.
   */
  it.each(["waves", "wind"] as AmbientToneId[])(
    "closes %s's envelope at the loop point",
    (id) => {
      const samples = samplesOf(buildToneWav(id));
      const edge = Math.round(TONE_SAMPLE_RATE * 0.4);
      const head = rms(samples, 0, edge);
      const tail = rms(samples, samples.length - edge, samples.length);
      expect(head / tail).toBeGreaterThan(0.5);
      expect(head / tail).toBeLessThan(2);
    },
  );
});
