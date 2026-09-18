import { EMPTY_AUDIO_INFO, flacMetadataBlocks, parseAudioInfo } from "@/lib/audioInfo";

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

function le16(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff]);
}

function le32(value: number): Uint8Array {
  return Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function zeros(count: number): Uint8Array {
  return new Uint8Array(count);
}

// --- FLAC -----------------------------------------------------------------

/** A FLAC metadata block header: last-block flag, type, 24-bit length. */
function flacBlock(type: number, body: Uint8Array, last = false): Uint8Array {
  return concat([
    Uint8Array.from([(last ? 0x80 : 0x00) | type]),
    Uint8Array.from([(body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff]),
    body,
  ]);
}

/**
 * A STREAMINFO block, written field by field from the FLAC spec rather than
 * from the reader's own offsets — otherwise the test would only prove the
 * reader agrees with itself.
 */
function flacStreamInfo(options: {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  totalSamples: number;
}): Uint8Array {
  const { sampleRate, channels, bitsPerSample, totalSamples } = options;
  const body = new Uint8Array(34);
  // Bytes 0–9 are block/frame size bounds, which this reader does not use.

  // 20 bits of sample rate, then 3 bits of (channels - 1), then 5 bits of
  // (bits per sample - 1), then 36 bits of total samples — MSB first.
  body[10] = (sampleRate >>> 12) & 0xff;
  body[11] = (sampleRate >>> 4) & 0xff;
  body[12] =
    ((sampleRate & 0x0f) << 4) |
    (((channels - 1) & 0x07) << 1) |
    (((bitsPerSample - 1) >>> 4) & 0x01);
  body[13] = (((bitsPerSample - 1) & 0x0f) << 4) | (Math.floor(totalSamples / 0x100000000) & 0x0f);
  const low = totalSamples % 0x100000000;
  body.set(be32(low), 14);

  return body;
}

function flacFile(options: {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  totalSamples: number;
}): Uint8Array {
  return concat([
    ascii("fLaC"),
    flacBlock(0, flacStreamInfo(options), true),
  ]);
}

/** A FLAC PICTURE metadata block, laid out per the spec. */
function flacPicture(data: Uint8Array, mime = "image/jpeg"): Uint8Array {
  const mimeBytes = ascii(mime);
  return concat([
    be32(3),
    be32(mimeBytes.length),
    mimeBytes,
    be32(0),
    be32(600),
    be32(600),
    be32(24),
    be32(0),
    be32(data.length),
    data,
  ]);
}

// --- WAV ------------------------------------------------------------------

function wavFile(options: {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
}): Uint8Array {
  const byteRate = options.sampleRate * options.channels * (options.bitsPerSample / 8);
  const fmt = concat([
    le16(options.format),
    le16(options.channels),
    le32(options.sampleRate),
    le32(byteRate),
    le16(options.channels * (options.bitsPerSample / 8)),
    le16(options.bitsPerSample),
  ]);
  const body = concat([
    ascii("WAVE"),
    ascii("fmt "),
    le32(fmt.length),
    fmt,
    ascii("data"),
    le32(options.dataBytes),
  ]);
  return concat([ascii("RIFF"), le32(body.length), body]);
}

// --- Ogg ------------------------------------------------------------------

/** One Ogg page holding a single packet, which is all the reader looks at. */
function oggPage(packet: Uint8Array): Uint8Array {
  return concat([
    ascii("OggS"),
    Uint8Array.from([0, 2]), // version, header type
    zeros(8), // granule position
    zeros(4), // serial
    zeros(4), // sequence
    zeros(4), // CRC
    Uint8Array.from([1]), // one segment
    Uint8Array.from([packet.length]),
    packet,
  ]);
}

function vorbisPacket(options: { channels: number; sampleRate: number; nominalBitrate: number }): Uint8Array {
  return concat([
    Uint8Array.from([1]),
    ascii("vorbis"),
    le32(0),
    Uint8Array.from([options.channels]),
    le32(options.sampleRate),
    le32(0), // maximum
    le32(options.nominalBitrate),
    le32(0), // minimum
  ]);
}

function opusPacket(options: { channels: number; inputSampleRate: number }): Uint8Array {
  return concat([
    ascii("OpusHead"),
    Uint8Array.from([1]),
    Uint8Array.from([options.channels]),
    le16(312), // pre-skip
    le32(options.inputSampleRate),
  ]);
}

// --- MP4 ------------------------------------------------------------------

function box(type: string, body: Uint8Array): Uint8Array {
  return concat([be32(8 + body.length), ascii(type), body]);
}

/** An MP4 with a movie header and one audio track, mirroring a real M4A. */
function mp4File(options: {
  brand: string;
  timescale: number;
  duration: number;
  format: string;
  channels: number;
  sampleSize: number;
  sampleRate: number;
}): Uint8Array {
  const mvhd = box(
    "mvhd",
    concat([
      Uint8Array.from([0, 0, 0, 0]), // version 0 + flags
      zeros(4), // creation
      zeros(4), // modification
      be32(options.timescale),
      be32(options.duration),
      zeros(16), // rate, volume, reserved
    ]),
  );

  const hdlr = box(
    "hdlr",
    concat([
      Uint8Array.from([0, 0, 0, 0]), // version 0 + flags
      zeros(4), // pre-defined
      ascii("soun"),
      zeros(12), // reserved + name
    ]),
  );

  // AudioSampleEntry: 16 bytes of box + sample-entry header, then the audio
  // fields, with the sample rate as 16.16 fixed point.
  const entry = box(
    options.format,
    concat([
      zeros(6), // reserved
      le16(1), // data reference index
      zeros(8), // reserved
      le16(options.channels),
      le16(options.sampleSize),
      le16(0), // pre-defined
      le16(0), // reserved
      be32(options.sampleRate * 0x10000),
    ]),
  );

  const stsd = box("stsd", concat([Uint8Array.from([0, 0, 0, 0]), be32(1), entry]));
  const stbl = box("stbl", stsd);
  const minf = box("minf", stbl);
  const mdia = box("mdia", concat([hdlr, minf]));
  const trak = box("trak", mdia);
  const moov = box("moov", concat([mvhd, trak]));
  const ftyp = box("ftyp", concat([ascii(options.brand), be32(0), ascii(options.brand)]));

  return concat([ftyp, moov]);
}

// --- MPEG -----------------------------------------------------------------

/**
 * An MPEG-1 Layer III frame header plus a body of the length the header
 * implies, so a second frame placed right after it is found where a real
 * encoder would have put it.
 */
function mpegFrame(options: {
  bitrateKbps: number;
  sampleRateHz: number;
  mono?: boolean;
  padding?: number;
}): Uint8Array {
  const bitrateIndex = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320].indexOf(
    options.bitrateKbps,
  );
  const sampleRateIndex = [44100, 48000, 32000].indexOf(options.sampleRateHz);
  const channelMode = options.mono ? 3 : 0;

  const header =
    (0x7ff << 21) |
    (3 << 19) | // MPEG-1
    (1 << 17) | // Layer III
    (1 << 16) | // no CRC
    (bitrateIndex << 12) |
    (sampleRateIndex << 10) |
    ((options.padding ?? 0) << 9) |
    (channelMode << 6);

  const frameLength = Math.floor((144 * options.bitrateKbps * 1000) / options.sampleRateHz) +
    (options.padding ?? 0);
  const frame = new Uint8Array(frameLength);
  frame.set(be32(header >>> 0), 0);
  return frame;
}

/** An ID3v2.3 tag holding a single empty text frame, so the tag has a size. */
function id3Tag(size: number): Uint8Array {
  return concat([
    ascii("ID3"),
    Uint8Array.from([3, 0, 0]),
    Uint8Array.from([(size >>> 21) & 0x7f, (size >>> 14) & 0x7f, (size >>> 7) & 0x7f, size & 0x7f]),
    zeros(size),
  ]);
}

describe("parseAudioInfo", () => {
  it("says nothing about a container it does not know", () => {
    expect(parseAudioInfo(ascii("nonsense bytes here"), { fileName: "x.xyz", fileSizeBytes: 19 })).toEqual(
      EMPTY_AUDIO_INFO,
    );
    expect(parseAudioInfo(new Uint8Array(0), { fileName: "x", fileSizeBytes: 0 })).toEqual(
      EMPTY_AUDIO_INFO,
    );
  });

  it("returns nothing for an empty window rather than throwing", () => {
    expect(() => parseAudioInfo(new Uint8Array(0), { fileName: "x.mp3", fileSizeBytes: 0 })).not.toThrow();
  });
});

describe("parseAudioInfo — FLAC", () => {
  it("unpacks all four bit-packed STREAMINFO fields", () => {
    const bytes = flacFile({
      sampleRate: 44_100,
      channels: 2,
      bitsPerSample: 16,
      totalSamples: 44_100 * 60,
    });

    const info = parseAudioInfo(bytes, { fileName: "album.flac", fileSizeBytes: bytes.length });

    expect(info.container).toBe("FLAC");
    expect(info.codec).toBe("FLAC");
    expect(info.sampleRateHz).toBe(44_100);
    expect(info.channels).toBe(2);
    expect(info.channelMode).toBe("Stereo");
    expect(info.bitsPerSample).toBe(16);
    expect(info.durationSec).toBeCloseTo(60, 5);
  });

  it("reads a mono 24-bit file, where every bit field differs", () => {
    const bytes = flacFile({
      sampleRate: 96_000,
      channels: 1,
      bitsPerSample: 24,
      totalSamples: 96_000 * 30,
    });

    const info = parseAudioInfo(bytes, { fileName: "voice.flac", fileSizeBytes: bytes.length });

    expect(info.sampleRateHz).toBe(96_000);
    expect(info.channels).toBe(1);
    expect(info.channelMode).toBe("Mono");
    expect(info.bitsPerSample).toBe(24);
    expect(info.durationSec).toBeCloseTo(30, 5);
  });

  it("handles a sample count past the 32-bit boundary", () => {
    // 4,294,967,296 samples is one more than a 32-bit field can hold, so it only
    // reads back correctly if the 36-bit field is assembled properly.
    const totalSamples = 4_294_967_296 + 44_100;
    const bytes = flacFile({ sampleRate: 44_100, channels: 2, bitsPerSample: 16, totalSamples });

    const info = parseAudioInfo(bytes, { fileName: "long.flac", fileSizeBytes: bytes.length });
    expect(info.durationSec).toBeCloseTo(totalSamples / 44_100, 5);
  });

  it("reports an unknown sample rate rather than dividing by zero", () => {
    const bytes = flacFile({ sampleRate: 0, channels: 2, bitsPerSample: 16, totalSamples: 1000 });
    expect(parseAudioInfo(bytes, { fileName: "x.flac", fileSizeBytes: bytes.length }).durationSec).toBeNull();
  });

  it("walks the metadata chain to the last block", () => {
    const bytes = concat([
      ascii("fLaC"),
      flacBlock(0, flacStreamInfo({ sampleRate: 44_100, channels: 2, bitsPerSample: 16, totalSamples: 100 }), false),
      flacBlock(4, ascii("reference libFLAC"), false), // VORBIS_COMMENT
      flacBlock(6, flacPicture(Uint8Array.from([0xff, 0xd8, 0xff])), true),
    ]);

    const blocks = flacMetadataBlocks(bytes);
    expect(blocks.map((block) => block.type)).toEqual([0, 4, 6]);
    expect(blocks[2].length).toBe(flacPicture(Uint8Array.from([0xff, 0xd8, 0xff])).length);
  });
});

describe("parseAudioInfo — WAV", () => {
  it("reads the format chunk and computes the duration from the data chunk", () => {
    const bytes = wavFile({
      format: 1,
      channels: 2,
      sampleRate: 44_100,
      bitsPerSample: 16,
      dataBytes: 44_100 * 2 * 2 * 10, // ten seconds of 16-bit stereo
    });

    const info = parseAudioInfo(bytes, { fileName: "clip.wav", fileSizeBytes: bytes.length });

    expect(info.container).toBe("WAV");
    expect(info.codec).toBe("PCM");
    expect(info.sampleRateHz).toBe(44_100);
    expect(info.channels).toBe(2);
    expect(info.bitsPerSample).toBe(16);
    // 44100 × 2ch × 2 bytes = 176,400 bytes/s → 1,411 kbps.
    expect(info.bitrateKbps).toBe(1411);
    expect(info.durationSec).toBeCloseTo(10, 5);
  });

  it("names a format code it does not have a label for instead of guessing", () => {
    const bytes = wavFile({
      format: 0x0055,
      channels: 2,
      sampleRate: 44_100,
      bitsPerSample: 16,
      dataBytes: 1000,
    });

    expect(parseAudioInfo(bytes, { fileName: "x.wav", fileSizeBytes: bytes.length }).codec).toBe("Format 0x55");
  });
});

describe("parseAudioInfo — Ogg", () => {
  it("reads a Vorbis identification header and its nominal bitrate", () => {
    const bytes = oggPage(vorbisPacket({ channels: 2, sampleRate: 44_100, nominalBitrate: 128_000 }));

    const info = parseAudioInfo(bytes, { fileName: "x.ogg", fileSizeBytes: bytes.length });

    expect(info.container).toBe("Ogg");
    expect(info.codec).toBe("Vorbis");
    expect(info.sampleRateHz).toBe(44_100);
    expect(info.channels).toBe(2);
    expect(info.bitrateKbps).toBe(128);
    // Vorbis is variable by definition; no header has to say so.
    expect(info.variableBitrate).toBe(true);
  });

  it("reads an OpusHead, whose sample rate sits at a different offset", () => {
    const bytes = oggPage(opusPacket({ channels: 1, inputSampleRate: 48_000 }));

    const info = parseAudioInfo(bytes, { fileName: "x.opus", fileSizeBytes: bytes.length });

    expect(info.codec).toBe("Opus");
    expect(info.channels).toBe(1);
    expect(info.sampleRateHz).toBe(48_000);
    expect(info.channelMode).toBe("Mono");
  });

  it("names the container even when the codec is one it cannot describe", () => {
    const bytes = oggPage(concat([ascii("\u007fFLAC"), zeros(20)]));
    const info = parseAudioInfo(bytes, { fileName: "x.oga", fileSizeBytes: bytes.length });

    expect(info.container).toBe("Ogg");
    expect(info.codec).toBe("FLAC");
  });
});

describe("parseAudioInfo — MP4", () => {
  it("reads the brand, the movie header and the audio sample entry", () => {
    const bytes = mp4File({
      brand: "M4B",
      timescale: 1000,
      duration: 3_600_000,
      format: "mp4a",
      channels: 2,
      sampleSize: 16,
      sampleRate: 44_100,
    });

    const info = parseAudioInfo(bytes, { fileName: "book.m4b", fileSizeBytes: bytes.length });

    expect(info.container).toBe("M4B");
    expect(info.codec).toBe("AAC");
    expect(info.channels).toBe(2);
    expect(info.bitsPerSample).toBe(16);
    expect(info.sampleRateHz).toBe(44_100);
    expect(info.durationSec).toBeCloseTo(3600, 5);
  });

  it("prefers the MP4 boxes over an MPEG frame sync hiding in the brand", () => {
    // A brand whose four characters look nothing like a frame header, but the
    // box walk must still win: this is why the dispatch is ordered as it is.
    const bytes = mp4File({
      brand: "isom",
      timescale: 600,
      duration: 600,
      format: "alac",
      channels: 2,
      sampleSize: 24,
      sampleRate: 48_000,
    });

    const info = parseAudioInfo(bytes, { fileName: "x.m4a", fileSizeBytes: bytes.length });
    expect(info.codec).toBe("ALAC");
    expect(info.container).toBe("MP4");
  });

  it("finds a movie header that sits in a tail window", () => {
    const bytes = mp4File({
      brand: "M4A",
      timescale: 1000,
      duration: 250_000,
      format: "mp4a",
      channels: 2,
      sampleSize: 16,
      sampleRate: 44_100,
    });
    // Pretend the window is the last slice of a much larger file.
    const prefix = zeros(4_000_000);
    const fileSizeBytes = prefix.length + bytes.length;

    const info = parseAudioInfo(bytes, {
      fileName: "x.m4a",
      fileSizeBytes,
      byteOffset: prefix.length,
    });

    expect(info.durationSec).toBeCloseTo(250, 5);
    expect(info.codec).toBe("AAC");
  });

  it("still names the brand when the movie header is missing", () => {
    const ftyp = box("ftyp", concat([ascii("M4A "), be32(0), ascii("M4A ")]));
    const info = parseAudioInfo(ftyp, { fileName: "x.m4a", fileSizeBytes: ftyp.length });

    expect(info.container).toBe("M4A");
    expect(info.codec).toBeNull();
    expect(info.durationSec).toBeNull();
  });
});

describe("parseAudioInfo — MPEG", () => {
  it("reads a constant-bitrate stream and derives its duration from the file size", () => {
    const frame = mpegFrame({ bitrateKbps: 128, sampleRateHz: 44_100 });
    // Ten frames' worth, with the second frame header where the first implies.
    const bytes = new Uint8Array(frame.length * 10);
    bytes.set(frame, 0);
    bytes.set(frame, frame.length);

    const info = parseAudioInfo(bytes, { fileName: "x.mp3", fileSizeBytes: bytes.length });

    expect(info.container).toBe("MP3");
    expect(info.codec).toBe("MPEG-1 Layer III");
    expect(info.bitrateKbps).toBe(128);
    expect(info.sampleRateHz).toBe(44_100);
    expect(info.channels).toBe(2);
    expect(info.channelMode).toBe("Stereo");
    expect(info.variableBitrate).toBe(false);
    expect(info.durationSec).toBeCloseTo((bytes.length * 8) / 128_000, 3);
  });

  it("reports a mono frame's channel count and mode", () => {
    const frame = mpegFrame({ bitrateKbps: 64, sampleRateHz: 44_100, mono: true });
    const bytes = new Uint8Array(frame.length * 4);
    bytes.set(frame, 0);

    const info = parseAudioInfo(bytes, { fileName: "x.mp3", fileSizeBytes: bytes.length });
    expect(info.sampleRateHz).toBe(44_100);
    expect(info.channels).toBe(1);
    expect(info.channelMode).toBe("Mono");
  });

  it("skips an ID3v2 tag before looking for the first frame", () => {
    const frame = mpegFrame({ bitrateKbps: 192, sampleRateHz: 48_000 });
    const tag = id3Tag(3000);
    const bytes = concat([tag, frame, frame]);

    const info = parseAudioInfo(bytes, { fileName: "x.mp3", fileSizeBytes: bytes.length });

    expect(info.sampleRateHz).toBe(48_000);
    expect(info.bitrateKbps).toBe(192);
  });

  it("takes the frame count from a Xing header and calls it VBR", () => {
    const frame = mpegFrame({ bitrateKbps: 128, sampleRateHz: 44_100 });
    // The Xing tag sits after the 4-byte header and the 32-byte side info.
    const xingAt = 4 + 32;
    frame.set(ascii("Xing"), xingAt);
    frame.set(be32(0x1), xingAt + 4); // frames flag only
    frame.set(be32(1000), xingAt + 8);

    const bytes = concat([frame, new Uint8Array(frame.length * 5)]);
    const info = parseAudioInfo(bytes, { fileName: "x.mp3", fileSizeBytes: bytes.length });

    expect(info.variableBitrate).toBe(true);
    // 1000 frames × 1152 samples ÷ 44100 Hz.
    expect(info.durationSec).toBeCloseTo((1000 * 1152) / 44_100, 5);
  });

  it("treats LAME's 'Info' header as constant bitrate", () => {
    // LAME writes the same counters under the word "Info" for a CBR file, so
    // reading the tag alone would mislabel every LAME-encoded CBR MP3.
    const frame = mpegFrame({ bitrateKbps: 128, sampleRateHz: 44_100 });
    const xingAt = 4 + 32;
    frame.set(ascii("Info"), xingAt);
    frame.set(be32(0x3), xingAt + 4); // frames and bytes
    frame.set(be32(1000), xingAt + 8);
    // 26.12 s at 128 kbps is 417,952 bytes — the average the header implies.
    frame.set(be32(417_952), xingAt + 12);

    const bytes = concat([frame, new Uint8Array(frame.length * 5)]);
    const info = parseAudioInfo(bytes, { fileName: "x.mp3", fileSizeBytes: bytes.length });

    expect(info.variableBitrate).toBe(false);
    expect(info.durationSec).toBeCloseTo((1000 * 1152) / 44_100, 5);
    // The byte counter turns the frame count into a true average bitrate.
    expect(info.bitrateKbps).toBe(128);
  });

  it("notices a bitrate change between two frames", () => {
    const first = mpegFrame({ bitrateKbps: 128, sampleRateHz: 44_100 });
    const second = mpegFrame({ bitrateKbps: 192, sampleRateHz: 44_100 });
    const bytes = concat([first, second]);

    const info = parseAudioInfo(bytes, { fileName: "x.mp3", fileSizeBytes: bytes.length });
    expect(info.variableBitrate).toBe(true);
    // No frame count is available, so no duration is claimed.
    expect(info.durationSec).toBeNull();
  });
});
