import { EMPTY_AUDIO_TAGS, readAudioTags } from "@/lib/audioTags";

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function syncSafeBytes(value: number): number[] {
  return [(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f];
}

function bigEndian32(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** Builds one text frame. `major` selects the v2.2 three-char id and size encoding. */
function textFrame(id: string, text: string, major = 3, encoding = 3): Uint8Array {
  const payload =
    encoding === 0
      ? Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)
      : new TextEncoder().encode(text);
  const body = new Uint8Array(payload.length + 1);
  body[0] = encoding;
  body.set(payload, 1);

  const idLength = major === 2 ? 3 : 4;
  const headerLength = major === 2 ? 6 : 10;
  const frame = new Uint8Array(headerLength + body.length);
  for (let index = 0; index < idLength; index += 1) {
    frame[index] = id.charCodeAt(index);
  }
  if (major === 2) {
    frame[3] = (body.length >> 16) & 0xff;
    frame[4] = (body.length >> 8) & 0xff;
    frame[5] = body.length & 0xff;
  } else if (major === 4) {
    frame.set(syncSafeBytes(body.length), 4);
  } else {
    frame.set(bigEndian32(body.length), 4);
  }
  frame.set(body, headerLength);
  return frame;
}

function utf16Frame(id: string, text: string, littleEndian: boolean, withBom: boolean): Uint8Array {
  const units: number[] = [];
  if (withBom) {
    units.push(0xff, 0xfe);
  }
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (littleEndian) {
      units.push(code & 0xff, (code >> 8) & 0xff);
    } else {
      units.push((code >> 8) & 0xff, code & 0xff);
    }
  }
  const body = new Uint8Array(units.length + 1);
  body[0] = withBom ? 1 : 2;
  body.set(units, 1);

  const frame = new Uint8Array(10 + body.length);
  for (let index = 0; index < 4; index += 1) {
    frame[index] = id.charCodeAt(index);
  }
  frame.set(bigEndian32(body.length), 4);
  frame.set(body, 10);
  return frame;
}

function id3Tag(frames: Uint8Array[], major = 3, flags = 0): Uint8Array {
  const body = concat(frames);
  const header = new Uint8Array(10);
  header[0] = 0x49;
  header[1] = 0x44;
  header[2] = 0x33;
  header[3] = major;
  header[4] = 0;
  header[5] = flags;
  header.set(syncSafeBytes(body.length), 6);
  return concat([header, body]);
}

describe("readAudioTags", () => {
  it("returns empty tags for audio without an ID3 header", () => {
    expect(readAudioTags(new Uint8Array([0x00, 0x01, 0x02]))).toEqual(EMPTY_AUDIO_TAGS);
    expect(readAudioTags(new Uint8Array(0))).toEqual(EMPTY_AUDIO_TAGS);
  });

  it("reads the core text frames from a v2.3 tag", () => {
    const tag = id3Tag([
      textFrame("TIT2", "Thermodynamics"),
      textFrame("TPE1", "R. Feynman"),
      textFrame("TALB", "Physics 101"),
      textFrame("TYER", "1987"),
    ]);

    expect(readAudioTags(tag)).toEqual({
      title: "Thermodynamics",
      artist: "R. Feynman",
      album: "Physics 101",
      trackNumber: null,
      discNumber: null,
      year: 1987,
      movement: null,
      movementNumber: null,
    });
  });

  it("takes the first number from n/total frames", () => {
    const tag = id3Tag([
      textFrame("TRCK", "3/12"),
      textFrame("TPOS", "2/2"),
      textFrame("MVIN", "7/24"),
    ]);

    const tags = readAudioTags(tag);
    expect(tags.trackNumber).toBe(3);
    expect(tags.discNumber).toBe(2);
    expect(tags.movementNumber).toBe(7);
  });

  it("derives the year from a v2.4 TDRC timestamp", () => {
    const tag = id3Tag([textFrame("TDRC", "2024-03-12T10:00:00")], 4);
    expect(readAudioTags(tag).year).toBe(2024);
  });

  it("reads the movement frames audiobooks use for chapters", () => {
    const tag = id3Tag([textFrame("MVNM", "Chapter Four"), textFrame("MVIN", "4")]);
    const tags = readAudioTags(tag);
    expect(tags.movement).toBe("Chapter Four");
    expect(tags.movementNumber).toBe(4);
  });

  it("decodes UTF-16 with a byte-order mark", () => {
    const tag = id3Tag([utf16Frame("TIT2", "Größe", true, true)]);
    expect(readAudioTags(tag).title).toBe("Größe");
  });

  it("decodes UTF-16BE without a byte-order mark", () => {
    const tag = id3Tag([utf16Frame("TIT2", "Größe", false, false)]);
    expect(readAudioTags(tag).title).toBe("Größe");
  });

  it("decodes Latin-1 text frames", () => {
    const tag = id3Tag([textFrame("TIT2", "Café", 3, 0)]);
    expect(readAudioTags(tag).title).toBe("Café");
  });

  it("reads v2.2 three-character frame ids", () => {
    const tag = id3Tag([textFrame("TT2", "Old Tag", 2), textFrame("TP1", "Someone", 2)], 2);
    const tags = readAudioTags(tag);
    expect(tags.title).toBe("Old Tag");
    expect(tags.artist).toBe("Someone");
  });

  it("reads v2.4 syncsafe frame sizes", () => {
    const tag = id3Tag([textFrame("TIT2", "Long enough to matter", 4)], 4);
    expect(readAudioTags(tag).title).toBe("Long enough to matter");
  });

  it("skips the extended header when the flag is set", () => {
    // v2.3 extended header: a 4-byte size that excludes itself, then flags(2)
    // and padding size(4) — so size 6 describes a 10-byte header in total.
    const extended = new Uint8Array([0, 0, 0, 6, 0, 0, 0, 0, 0, 0]);
    const tag = id3Tag([concat([extended, textFrame("TIT2", "After Extended")])], 3, 0x40);
    expect(readAudioTags(tag).title).toBe("After Extended");
  });

  it("stops at padding rather than reading into it", () => {
    const padding = new Uint8Array(64);
    const tag = id3Tag([textFrame("TIT2", "Padded"), padding]);
    expect(readAudioTags(tag).title).toBe("Padded");
  });

  it("takes the first value of a null-separated frame", () => {
    const tag = id3Tag([textFrame("TPE1", "First\u0000Second")]);
    expect(readAudioTags(tag).artist).toBe("First");
  });

  it("ignores a frame whose declared size overruns the tag", () => {
    const broken = id3Tag([textFrame("TIT2", "Fine")]);
    // Corrupt the second frame's size to claim more bytes than exist.
    broken[10 + 4] = 0x7f;
    broken[10 + 5] = 0xff;
    broken[10 + 6] = 0xff;
    broken[10 + 7] = 0xff;
    expect(() => readAudioTags(broken)).not.toThrow();
  });

  it("does not mistake other formats for ID3", () => {
    // "fLaC" — a FLAC stream, which carries Vorbis comments, not ID3v2.
    expect(readAudioTags(new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0, 0, 0, 34, 0, 0]))).toEqual(
      EMPTY_AUDIO_TAGS,
    );
  });
});
