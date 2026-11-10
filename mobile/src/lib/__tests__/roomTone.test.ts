/**
 * The generated room-tone file.
 *
 * The buffer is the one thing here that cannot be checked by eye, so the cases
 * assert the properties that matter: it is a file the player will accept, it is
 * not silence (the entire purpose), it has no DC offset, and it is the same
 * bytes every time so a change to the generator is a deliberate one.
 */

import {
  ROOM_TONE_SAMPLE_RATE,
  ROOM_TONE_SECONDS,
  buildRoomToneWav,
} from "@/lib/roomTone";

const HEADER_BYTES = 44;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

describe("buildRoomToneWav", () => {
  const wav = buildRoomToneWav();
  const header = view(wav);

  it("is a mono 16-bit PCM WAV the player will accept", () => {
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(header.getUint16(20, true)).toBe(1); // PCM
    expect(header.getUint16(22, true)).toBe(1); // mono
    expect(header.getUint32(24, true)).toBe(ROOM_TONE_SAMPLE_RATE);
    expect(header.getUint16(34, true)).toBe(16);
  });

  it("declares the length it actually has", () => {
    const sampleCount = ROOM_TONE_SAMPLE_RATE * ROOM_TONE_SECONDS;
    expect(wav.byteLength).toBe(HEADER_BYTES + sampleCount * 2);
    expect(header.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(header.getUint32(40, true)).toBe(sampleCount * 2);
  });

  it("is noise, not silence — the reason it exists", () => {
    const samples = new Int16Array(wav.buffer, wav.byteOffset + HEADER_BYTES);
    const nonZero = samples.reduce((count, sample) => count + (sample !== 0 ? 1 : 0), 0);
    expect(nonZero).toBeGreaterThan(samples.length * 0.99);
  });

  it("has no DC offset, which would eat the headroom it normalises against", () => {
    const samples = new Int16Array(wav.buffer, wav.byteOffset + HEADER_BYTES);
    const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(120); // ~0.4% of full scale
  });

  it("is normalised near its target peak rather than clipping or whispering", () => {
    const samples = new Int16Array(wav.buffer, wav.byteOffset + HEADER_BYTES);
    const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    // TARGET_PEAK is 0.7 of full scale, minus the rounding of the quantisation.
    expect(peak).toBeGreaterThan(32767 * 0.69);
    expect(peak).toBeLessThanOrEqual(32767 * 0.71);
  });

  it("is deterministic for a seed and different across seeds", () => {
    expect(buildRoomToneWav().slice(HEADER_BYTES, HEADER_BYTES + 64)).toEqual(
      wav.slice(HEADER_BYTES, HEADER_BYTES + 64),
    );
    expect(buildRoomToneWav({ seed: 12345 }).slice(HEADER_BYTES, HEADER_BYTES + 64)).not.toEqual(
      wav.slice(HEADER_BYTES, HEADER_BYTES + 64),
    );
  });

  it("honours a different sample rate and length", () => {
    const short = buildRoomToneWav({ sampleRate: 8000, seconds: 1 });
    expect(view(short).getUint32(24, true)).toBe(8000);
    expect(short.byteLength).toBe(HEADER_BYTES + 8000 * 2);
  });
});
