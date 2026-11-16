/**
 * The tone catalogue and the one tone still generated in code.
 *
 * Two things are worth pinning here. The catalogue is what the picker draws and
 * what the player resolves to a file, so every recorded entry must actually
 * have a file and a credit — a missing asset is a tone that silently does
 * nothing, and a missing credit is a licence breach. And the room tone is the
 * only tone whose bytes this app produces, so its loop, its loudness and its
 * determinism are asserted rather than assumed.
 */

import {
  DEFAULT_TONE_ID,
  TONES,
  TONE_CREDITS,
  TONE_SAMPLE_RATE,
  TONE_TARGET_RMS_DB,
  buildRoomToneWav,
  describeCredits,
  findTone,
  parseToneId,
  toneAsset,
  toneFileName,
} from "@/lib/ambientTones";

const HEADER_BYTES = 44;

function samplesOf(wav: Uint8Array): Int16Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const count = (wav.byteLength - HEADER_BYTES) / 2;
  const out = new Int16Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = view.getInt16(HEADER_BYTES + i * 2, true);
  }
  return out;
}

function rmsOf(samples: Int16Array): number {
  let energy = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = (samples[i] as number) / 32768;
    energy += value * value;
  }
  return Math.sqrt(energy / samples.length);
}

describe("the catalogue", () => {
  it("names every tone once", () => {
    const ids = TONES.map((tone) => tone.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers the places a listener would ask for", () => {
    const ids = TONES.map((tone) => tone.id);

    expect(ids).toEqual(
      expect.arrayContaining(["rain", "forest", "river", "ocean", "wind", "birds"]),
    );
  });

  it("opens on the room tone, which is not a place", () => {
    expect(TONES[0]?.id).toBe("room");
    expect(DEFAULT_TONE_ID).toBe("room");
  });

  it("gives every tone a label and a line saying what it sounds like", () => {
    for (const tone of TONES) {
      expect(tone.label.length).toBeGreaterThan(0);
      expect(tone.hint.length).toBeGreaterThan(0);
    }
  });

  it("ships a file for every recorded tone", () => {
    // A recorded tone with no asset is a row in the picker that produces no
    // sound, which reads as a broken feature rather than a missing file.
    for (const tone of TONES) {
      if (tone.kind !== "recorded") {
        continue;
      }
      expect(toneAsset(tone.id)).not.toBeNull();
    }
  });

  it("generates the room tone rather than shipping one", () => {
    // Room tone *is* noise; a deterministic buffer is smaller, retunable and
    // testable in a way a binary is not.
    expect(findTone("room")?.kind).toBe("generated");
    expect(toneAsset("room")).toBeNull();
  });

  it("credits every recording that requires it", () => {
    for (const tone of TONES) {
      if (tone.kind !== "recorded") {
        continue;
      }
      const credit = TONE_CREDITS[tone.id];
      expect(credit).toBeDefined();
      expect(credit?.artist.length).toBeGreaterThan(0);
      expect(credit?.licence).toMatch(/CC/);
    }
  });

  it("spells the credits out for the listener", () => {
    const line = describeCredits();

    expect(line).toContain("CC BY 4.0");
    expect(line).toContain("Jarrod Stanley");
    expect(line).not.toMatch(/undefined/);
  });
});

describe("parseToneId", () => {
  it("keeps a tone this build has", () => {
    expect(parseToneId("river")).toBe("river");
    expect(parseToneId("birds")).toBe("birds");
  });

  it("falls back rather than leaving the player with a file nothing provides", () => {
    // "waves" was a synthetic tone this build replaced with a recording; a
    // listener who had it selected must land somewhere playable.
    expect(parseToneId("waves")).toBe(DEFAULT_TONE_ID);
    expect(parseToneId("nope")).toBe(DEFAULT_TONE_ID);
    expect(parseToneId(null)).toBe(DEFAULT_TONE_ID);
    expect(parseToneId(undefined)).toBe(DEFAULT_TONE_ID);
  });
});

describe("toneFileName", () => {
  it("names the generated file after its tone, so switching costs one write", () => {
    expect(toneFileName("room")).toBe("tone-room.wav");
  });
});

describe("buildRoomToneWav", () => {
  const wav = buildRoomToneWav();
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  it("writes a valid mono 16-bit WAV header", () => {
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(TONE_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8);
  });

  it("is exactly as long as the catalogue says", () => {
    const seconds = findTone("room")?.seconds ?? 0;

    expect(samplesOf(wav).length).toBe(Math.round(TONE_SAMPLE_RATE * seconds));
  });

  it("is not silence, which is the one thing it exists to prevent", () => {
    expect(rmsOf(samplesOf(wav))).toBeGreaterThan(0.01);
  });

  it("lands on the shared RMS the volume mapping assumes", () => {
    // `roomToneAmplitude` converts a level in dBFS to a linear volume by
    // subtracting this buffer's RMS, so a buffer at a different level would
    // make every tone slider position mean something else.
    const measuredDb = 20 * Math.log10(rmsOf(samplesOf(wav)));

    expect(Math.abs(measuredDb - TONE_TARGET_RMS_DB)).toBeLessThan(1);
  });

  it("leaves headroom rather than clipping", () => {
    const samples = samplesOf(wav);
    let peak = 0;
    for (let i = 0; i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i] as number));
    }

    expect(peak).toBeLessThan(32767 * 0.99);
  });

  it("has no DC offset, which would eat the headroom it needs", () => {
    const samples = samplesOf(wav);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      sum += samples[i] as number;
    }

    expect(Math.abs(sum / samples.length)).toBeLessThan(50);
  });

  it("is deterministic, so the same build produces the same bytes", () => {
    expect(buildRoomToneWav().slice(HEADER_BYTES, HEADER_BYTES + 256)).toEqual(
      buildRoomToneWav().slice(HEADER_BYTES, HEADER_BYTES + 256),
    );
  });

  it("honours a different seed and a different length", () => {
    expect(buildRoomToneWav({ seed: 12345 }).slice(HEADER_BYTES, HEADER_BYTES + 256)).not.toEqual(
      buildRoomToneWav().slice(HEADER_BYTES, HEADER_BYTES + 256),
    );
    expect(samplesOf(buildRoomToneWav({ seconds: 1 })).length).toBe(TONE_SAMPLE_RATE);
  });

  it("honours a different sample rate", () => {
    const low = buildRoomToneWav({ sampleRate: 8000, seconds: 1 });

    expect(new DataView(low.buffer).getUint32(24, true)).toBe(8000);
    expect(samplesOf(low).length).toBe(8000);
  });
});
