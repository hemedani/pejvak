import {
  artworkExtension,
  artworkMimeType,
  readEmbeddedArtwork,
} from "@/lib/embeddedArtwork";

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

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function be32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function zeros(count: number): Uint8Array {
  return new Uint8Array(count);
}

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

// --- ID3 ------------------------------------------------------------------

function id3Frame(id: string, body: Uint8Array): Uint8Array {
  return concat([ascii(id), be32(body.length), body]);
}

function apic(mime: string, data: Uint8Array, description = ""): Uint8Array {
  return id3Frame(
    "APIC",
    concat([
      Uint8Array.from([3]), // UTF-8
      ascii(mime),
      Uint8Array.from([0]), // MIME terminator
      Uint8Array.from([3]), // front cover
      ascii(description),
      Uint8Array.from([0]),
      data,
    ]),
  );
}

function id3File(frames: Uint8Array[]): Uint8Array {
  const body = concat(frames);
  return concat([
    ascii("ID3"),
    Uint8Array.from([3, 0, 0]),
    Uint8Array.from([
      (body.length >>> 21) & 0x7f,
      (body.length >>> 14) & 0x7f,
      (body.length >>> 7) & 0x7f,
      body.length & 0x7f,
    ]),
    body,
  ]);
}

// --- FLAC -----------------------------------------------------------------

function flacBlock(type: number, body: Uint8Array, last = false): Uint8Array {
  return concat([
    Uint8Array.from([(last ? 0x80 : 0x00) | type]),
    Uint8Array.from([(body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff]),
    body,
  ]);
}

function flacFile(picture: Uint8Array | null): Uint8Array {
  // 34 bytes of STREAMINFO, all zero — this reader does not interpret it.
  const streamInfo = flacBlock(0, zeros(34), picture === null);
  if (!picture) {
    return concat([ascii("fLaC"), streamInfo]);
  }
  return concat([ascii("fLaC"), streamInfo, flacBlock(6, picture, true)]);
}

function flacPictureBlock(mime: string, data: Uint8Array): Uint8Array {
  return concat([
    be32(3), // picture type: front cover
    be32(mime.length),
    ascii(mime),
    be32(0), // description length
    be32(600),
    be32(600),
    be32(24),
    be32(0),
    be32(data.length),
    data,
  ]);
}

// --- MP4 ------------------------------------------------------------------

function box(type: string, body: Uint8Array): Uint8Array {
  return concat([be32(8 + body.length), ascii(type), body]);
}

/**
 * An MP4 whose cover sits where an M4A keeps it: `moov/udta/meta/ilst/covr`,
 * with `meta` carrying the four version/flag bytes every full box has.
 */
function mp4File(covers: Uint8Array[], includeCover = true): Uint8Array {
  const ftyp = box("ftyp", concat([ascii("M4A "), be32(0), ascii("M4A ")]));
  const children = includeCover
    ? [
        box(
          "covr",
          concat(
            covers.map((cover) =>
              concat([be32(16 + cover.length), ascii("data"), be32(13), be32(0), cover]),
            ),
          ),
        ),
      ]
    : [];
  const ilst = box("ilst", concat(children));
  const meta = box("meta", concat([zeros(4), ilst]));
  const udta = box("udta", meta);
  const moov = box("moov", udta);
  return concat([ftyp, moov]);
}

const MP4_OPTIONS = { fileName: "book.m4b", fileSizeBytes: 0 };

function readMp4(bytes: Uint8Array) {
  return readEmbeddedArtwork(bytes, { ...MP4_OPTIONS, fileSizeBytes: bytes.length });
}

describe("readEmbeddedArtwork — ID3", () => {
  it("takes the picture out of an APIC frame", () => {
    const bytes = id3File([apic("image/jpeg", JPEG)]);
    const picture = readEmbeddedArtwork(bytes, { fileSizeBytes: bytes.length });

    expect(picture?.mimeType).toBe("image/jpeg");
    expect(picture?.pictureType).toBe(3);
    expect(Array.from(picture?.data ?? [])).toEqual(Array.from(JPEG));
  });

  it("finds the picture when other frames come first", () => {
    const bytes = id3File([
      id3Frame("TIT2", concat([Uint8Array.from([3]), ascii("Chapter One")])),
      id3Frame("TPE1", concat([Uint8Array.from([3]), ascii("A Reader")])),
      apic("image/png", PNG),
    ]);

    expect(readEmbeddedArtwork(bytes, { fileSizeBytes: bytes.length })?.mimeType).toBe("image/png");
  });

  it("returns nothing when the tag is all text", () => {
    const bytes = id3File([id3Frame("TIT2", concat([Uint8Array.from([3]), ascii("No cover")]))]);
    expect(readEmbeddedArtwork(bytes, { fileSizeBytes: bytes.length })).toBeNull();
  });

  it("returns nothing rather than half an image when the window cuts the picture off", () => {
    const bytes = id3File([apic("image/jpeg", JPEG)]);
    // Everything up to the picture's first few bytes, and no further.
    const window = bytes.subarray(0, bytes.length - 4);

    expect(readEmbeddedArtwork(window, { fileSizeBytes: bytes.length })).toBeNull();
  });
});

describe("readEmbeddedArtwork — FLAC", () => {
  it("takes the picture out of a PICTURE metadata block", () => {
    const bytes = flacFile(flacPictureBlock("image/jpeg", JPEG));
    const picture = readEmbeddedArtwork(bytes, { fileSizeBytes: bytes.length });

    expect(picture?.mimeType).toBe("image/jpeg");
    expect(picture?.pictureType).toBe(3);
    expect(Array.from(picture?.data ?? [])).toEqual(Array.from(JPEG));
  });

  it("walks past other metadata blocks to reach it", () => {
    const bytes = concat([
      ascii("fLaC"),
      flacBlock(0, zeros(34), false), // STREAMINFO
      flacBlock(4, ascii("reference libFLAC 1.4"), false), // VORBIS_COMMENT
      flacBlock(6, flacPictureBlock("image/png", PNG), true),
    ]);

    expect(readEmbeddedArtwork(bytes, { fileSizeBytes: bytes.length })?.mimeType).toBe("image/png");
  });

  it("returns nothing when the file carries no PICTURE block", () => {
    const bytes = flacFile(null);
    expect(readEmbeddedArtwork(bytes, { fileSizeBytes: bytes.length })).toBeNull();
  });
});

describe("readEmbeddedArtwork — MP4", () => {
  it("takes the cover out of moov/udta/meta/ilst/covr", () => {
    const bytes = mp4File([JPEG]);
    const picture = readMp4(bytes);

    expect(picture?.mimeType).toBe("image/jpeg");
    expect(picture?.pictureType).toBe(3);
    expect(Array.from(picture?.data ?? [])).toEqual(Array.from(JPEG));
  });

  it("takes the first cover when several are attached", () => {
    const bytes = mp4File([PNG, JPEG]);
    expect(readMp4(bytes)?.mimeType).toBe("image/png");
  });

  it("returns nothing when there is no covr box at all", () => {
    expect(readMp4(mp4File([], false))).toBeNull();
  });

  it("finds the cover in a tail window, which is where an M4B keeps it", () => {
    const bytes = mp4File([JPEG]);
    const head = zeros(3_000_000);

    const picture = readEmbeddedArtwork(bytes, {
      byteOffset: head.length,
      fileSizeBytes: head.length + bytes.length,
    });

    expect(picture?.mimeType).toBe("image/jpeg");
    expect(Array.from(picture?.data ?? [])).toEqual(Array.from(JPEG));
  });

  it("does not read a tail window as if it were the head of the file", () => {
    // A window with an offset is a slice of the middle or end of a file. Its
    // first bytes are audio, not a signature, so only the box walk may apply.
    const window = concat([zeros(64), ascii("fLaC"), zeros(64)]);
    const picture = readEmbeddedArtwork(window, {
      byteOffset: 1_000,
      fileSizeBytes: 2_000,
    });

    expect(picture).toBeNull();
  });
});

describe("readEmbeddedArtwork — everything else", () => {
  it("returns nothing for a container it does not know", () => {
    const bytes = concat([ascii("RIFF"), zeros(4), ascii("WAVE"), zeros(64)]);
    expect(readEmbeddedArtwork(bytes, { fileSizeBytes: bytes.length })).toBeNull();
  });

  it("returns nothing for an empty window", () => {
    expect(readEmbeddedArtwork(new Uint8Array(0), { fileSizeBytes: 0 })).toBeNull();
  });
});

describe("artworkExtension", () => {
  it("names the file after the format it actually is", () => {
    expect(artworkExtension("image/jpeg")).toBe("jpg");
    expect(artworkExtension("image/png")).toBe("png");
    expect(artworkExtension("image/gif")).toBe("gif");
    expect(artworkExtension("image/webp")).toBe("webp");
    expect(artworkExtension("image/bmp")).toBe("bmp");
  });

  it("falls back to jpg rather than writing a nameless file", () => {
    expect(artworkExtension(null)).toBe("jpg");
    expect(artworkExtension("image/tiff")).toBe("jpg");
  });
});

describe("artworkMimeType", () => {
  it("round-trips every extension it can write", () => {
    for (const mime of ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"]) {
      expect(artworkMimeType(artworkExtension(mime))).toBe(mime);
    }
  });

  it("accepts a jpeg written as jpeg as well as jpg", () => {
    expect(artworkMimeType("jpeg")).toBe("image/jpeg");
    expect(artworkMimeType("PNG")).toBe("image/png");
  });

  it("returns null for an extension it does not know", () => {
    expect(artworkMimeType("tiff")).toBeNull();
  });
});
