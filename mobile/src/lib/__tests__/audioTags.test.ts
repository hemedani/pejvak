import {
  EMPTY_AUDIO_TAGS,
  MAX_PICTURE_BYTES,
  hasId3Header,
  readAudioTagBundle,
  readAudioTags,
  readId3TagSize,
  sniffImageMime,
} from "@/lib/audioTags";

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

/** Wraps a frame body in the header shape the tag's major version uses. */
function frameWith(id: string, body: Uint8Array, major = 3): Uint8Array {
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

/** Builds one text frame. `major` selects the v2.2 three-char id and size encoding. */
function textFrame(id: string, text: string, major = 3, encoding = 3): Uint8Array {
  const payload =
    encoding === 0
      ? Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)
      : new TextEncoder().encode(text);
  const body = new Uint8Array(payload.length + 1);
  body[0] = encoding;
  body.set(payload, 1);
  return frameWith(id, body, major);
}

/** A JPEG and a PNG, small enough to inline but real enough to sniff. */
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

/**
 * An attached picture. v2.3/v2.4 spell the format out as a MIME string
 * (`APIC`); v2.2 uses a three-character code (`PIC`).
 */
function pictureFrame(
  id: string,
  options: {
    mime: string;
    data?: Uint8Array;
    type?: number;
    description?: string;
    major?: number;
  },
): Uint8Array {
  const major = options.major ?? 3;
  const isV22 = major === 2;
  const mime = isV22
    ? Uint8Array.from(options.mime.slice(0, 3).toUpperCase(), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(options.mime);

  const body = concat([
    Uint8Array.from([3]),
    mime,
    // v2.2 has no MIME terminator: the format is a fixed three-byte field.
    ...(isV22 ? [] : [Uint8Array.from([0])]),
    Uint8Array.from([options.type ?? 3]),
    new TextEncoder().encode(options.description ?? ""),
    Uint8Array.from([0]),
    options.data ?? JPEG_BYTES,
  ]);
  return frameWith(id, body, major);
}

/** `COMM`/`USLT`: encoding | language(3) | description | text. */
function describedFrame(id: string, language: string, description: string, text: string): Uint8Array {
  return frameWith(
    id,
    concat([
      Uint8Array.from([3]),
      Uint8Array.from(language, (char) => char.charCodeAt(0)),
      new TextEncoder().encode(description),
      Uint8Array.from([0]),
      new TextEncoder().encode(text),
    ]),
  );
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

describe("readId3TagSize", () => {
  it("reports the declared frame bytes, excluding the header", () => {
    const tag = id3Tag([textFrame("TIT2", "Padded")]);
    expect(readId3TagSize(tag)).toBe(tag.length - 10);
  });

  it("returns null when there is no usable header", () => {
    expect(readId3TagSize(new Uint8Array(0))).toBeNull();
    // Right magic, but a version this reader does not know.
    const wrongVersion = id3Tag([textFrame("TIT2", "x")]);
    wrongVersion[3] = 5;
    expect(readId3TagSize(wrongVersion)).toBeNull();
    expect(hasId3Header(wrongVersion)).toBe(false);
  });

  it("recognises a v2.2 header, whose size is still syncsafe", () => {
    const tag = id3Tag([textFrame("TT2", "Old", 2)], 2);
    expect(readId3TagSize(tag)).toBe(tag.length - 10);
    expect(hasId3Header(tag)).toBe(true);
  });
});

describe("readAudioTagBundle", () => {
  it("reports the tag version, size and frame count", () => {
    const tag = id3Tag([textFrame("TIT2", "One"), textFrame("TPE1", "Two")]);
    const bundle = readAudioTagBundle(tag);

    expect(bundle.tagVersion).toBe("ID3v2.3");
    expect(bundle.tagSizeBytes).toBe(tag.length - 10);
    expect(bundle.frameCount).toBe(2);
    expect(bundle.truncated).toBe(false);
  });

  it("is empty, not thrown, for a buffer with no tag", () => {
    const bundle = readAudioTagBundle(new Uint8Array([0x00, 0x01, 0x02]));
    expect(bundle.tagVersion).toBeNull();
    expect(bundle.picture).toBeNull();
    expect(bundle.frameCount).toBe(0);
    expect(bundle.tags).toEqual(EMPTY_AUDIO_TAGS);
  });

  it("extracts the embedded picture from an APIC frame", () => {
    const tag = id3Tag([textFrame("TIT2", "Covered"), pictureFrame("APIC", { mime: "image/jpeg" })]);
    const picture = readAudioTagBundle(tag).picture;

    expect(picture).not.toBeNull();
    expect(picture?.mimeType).toBe("image/jpeg");
    expect(picture?.pictureType).toBe(3);
    expect(Array.from(picture?.data ?? [])).toEqual(Array.from(JPEG_BYTES));
  });

  it("skips a non-empty description rather than assuming it away", () => {
    const tag = id3Tag([
      pictureFrame("APIC", {
        mime: "image/png",
        data: PNG_BYTES,
        description: "Front cover, scanned 2019",
      }),
    ]);

    const picture = readAudioTagBundle(tag).picture;
    expect(picture?.mimeType).toBe("image/png");
    expect(Array.from(picture?.data ?? [])).toEqual(Array.from(PNG_BYTES));
  });

  it("trusts the image's own magic bytes over a wrong declared MIME", () => {
    const tag = id3Tag([pictureFrame("APIC", { mime: "image/jpeg", data: PNG_BYTES })]);
    expect(readAudioTagBundle(tag).picture?.mimeType).toBe("image/png");
  });

  it("reads a v2.2 PIC frame, whose format is a three-character code", () => {
    const tag = id3Tag([pictureFrame("PIC", { mime: "PNG", data: PNG_BYTES, major: 2 })], 2);
    const picture = readAudioTagBundle(tag).picture;

    expect(readAudioTagBundle(tag).tagVersion).toBe("ID3v2.2");
    expect(picture?.mimeType).toBe("image/png");
    expect(Array.from(picture?.data ?? [])).toEqual(Array.from(PNG_BYTES));
  });

  it("refuses a picture that is really a URL", () => {
    // `-->` means "fetch this", which would be a network call during a scan and
    // a broken tile offline.
    const tag = id3Tag([pictureFrame("APIC", { mime: "-->" })]);
    expect(readAudioTagBundle(tag).picture).toBeNull();
  });

  it("takes the first picture when a tag carries several", () => {
    const tag = id3Tag([
      pictureFrame("APIC", { mime: "image/png", data: PNG_BYTES, type: 3 }),
      pictureFrame("APIC", { mime: "image/jpeg", data: JPEG_BYTES, type: 4 }),
    ]);

    const picture = readAudioTagBundle(tag).picture;
    expect(picture?.mimeType).toBe("image/png");
    expect(picture?.pictureType).toBe(3);
  });

  it("flags a truncated read instead of reporting a confident 'no picture'", () => {
    const full = id3Tag([
      textFrame("TIT2", "Title"),
      pictureFrame("APIC", { mime: "image/jpeg" }),
    ]);
    // Only the header and the first frame survive the window.
    const window = full.subarray(0, 12 + 10);

    const bundle = readAudioTagBundle(window);
    expect(bundle.truncated).toBe(true);
    expect(bundle.picture).toBeNull();
  });

  it("reads the extended text frames the details panel shows", () => {
    const tag = id3Tag([
      textFrame("TPE2", "Various Readers"),
      textFrame("TCOM", "A. Composer"),
      textFrame("TCON", "(31)"),
      textFrame("TBPM", "128"),
      textFrame("TIT3", "Unabridged"),
      textFrame("TSRC", "USRC17607839"),
      textFrame("TKEY", "Cm"),
      textFrame("TMOO", "Calm"),
    ]);

    const { details } = readAudioTagBundle(tag);
    expect(details.albumArtist).toBe("Various Readers");
    expect(details.composer).toBe("A. Composer");
    // `(31)` is the ID3v1 genre table's entry 31.
    expect(details.genre).toBe("Trance");
    expect(details.bpm).toBe(128);
    expect(details.subtitle).toBe("Unabridged");
    expect(details.isrc).toBe("USRC17607839");
    expect(details.musicalKey).toBe("Cm");
    expect(details.mood).toBe("Calm");
  });

  it("ignores a non-numeric BPM rather than storing NaN", () => {
    const tag = id3Tag([textFrame("TBPM", "fast")]);
    expect(readAudioTagBundle(tag).details.bpm).toBeNull();
  });

  it("reads a comment and keeps its language", () => {
    const tag = id3Tag([describedFrame("COMM", "eng", "", "Ripped from CD")]);
    const { details } = readAudioTagBundle(tag);

    expect(details.comment).toBe("Ripped from CD");
    expect(details.language).toBe("eng");
  });

  it("reads lyrics from USLT without confusing them for a comment", () => {
    const tag = id3Tag([describedFrame("USLT", "eng", "Verse", "First line\nSecond line")]);
    const { details } = readAudioTagBundle(tag);

    expect(details.lyrics).toBe("First line\nSecond line");
    expect(details.comment).toBeNull();
  });

  it("reads v2.2 comment and lyrics frames", () => {
    const tag = id3Tag(
      [describedFrame("COM", "eng", "", "Legacy comment"), describedFrame("ULT", "eng", "", "Legacy")],
      2,
    );
    const { details } = readAudioTagBundle(tag);

    expect(details.comment).toBe("Legacy comment");
    expect(details.lyrics).toBe("Legacy");
  });

  it("is the projection `readAudioTags` returns, so the two cannot disagree", () => {
    const tag = id3Tag([textFrame("TIT2", "Same"), textFrame("TPE1", "Both")]);
    expect(readAudioTags(tag)).toEqual(readAudioTagBundle(tag).tags);
  });

  it("does not fail on a picture whose bytes exceed the cap", () => {
    const huge = new Uint8Array(MAX_PICTURE_BYTES + 1);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    const tag = id3Tag([textFrame("TIT2", "Still read"), pictureFrame("APIC", { mime: "image/jpeg", data: huge })]);

    const bundle = readAudioTagBundle(tag);
    expect(bundle.picture).toBeNull();
    expect(bundle.tags.title).toBe("Still read");
  });
});

describe("sniffImageMime", () => {
  it("identifies the formats artwork actually arrives in", () => {
    expect(sniffImageMime(JPEG_BYTES)).toBe("image/jpeg");
    expect(sniffImageMime(PNG_BYTES)).toBe("image/png");
    expect(sniffImageMime(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
    expect(sniffImageMime(Uint8Array.from([0x42, 0x4d, 0x00, 0x00]))).toBe("image/bmp");
    expect(
      sniffImageMime(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe("image/webp");
  });

  it("returns null for bytes that are not an image", () => {
    expect(sniffImageMime(new Uint8Array([0x49, 0x44, 0x33]))).toBeNull();
    expect(sniffImageMime(new Uint8Array(0))).toBeNull();
  });
});
