/**
 * Reading binary media structures out of a byte window.
 *
 * Shared by the tag reader, the stream inspector and the artwork reader, which
 * all walk the same files with different questions. Three things live here and
 * nothing else: the byte readers, an ASCII signature test, and ISO base media
 * (MP4) box walking — because two of the three callers need to descend an MP4
 * box tree and both hit the same awkward case.
 *
 * Every reader takes an offset and returns a value rather than throwing. A
 * window is a slice of a file, so "past the end" is normal, not exceptional.
 */

// --- Byte readers ---------------------------------------------------------

export function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

export function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

export function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

export function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

export function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return out;
}

/** Case-sensitive ASCII signature test. Bounds are checked, not assumed. */
export function matchesAscii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset < 0 || offset + text.length > bytes.length) {
    return false;
  }
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

// --- ISO base media (MP4) boxes -------------------------------------------

export type Atom = { type: string; start: number; end: number; headerBytes: number };

/** Reads one box header at `offset`, or null when it does not fit the window. */
export function readAtom(bytes: Uint8Array, offset: number): Atom | null {
  if (offset + 8 > bytes.length) {
    return null;
  }
  let size = readUint32BE(bytes, offset);
  const type = readAscii(bytes, offset + 4, 4);
  let headerBytes = 8;
  if (size === 1) {
    // 64-bit extended size, for boxes past 4 GB.
    if (offset + 16 > bytes.length) {
      return null;
    }
    size = readUint32BE(bytes, offset + 8) * 0x100000000 + readUint32BE(bytes, offset + 12);
    headerBytes = 16;
  } else if (size === 0) {
    // "To the end of the file".
    size = bytes.length - offset;
  }
  if (size < headerBytes || offset + size > bytes.length) {
    return null;
  }
  return { type, start: offset, end: offset + size, headerBytes };
}

/** Every box in `[from, to)`, stopping at the first one that overruns. */
export function childAtoms(bytes: Uint8Array, from: number, to: number): Atom[] {
  const atoms: Atom[] = [];
  let offset = from;
  while (offset < to) {
    const atom = readAtom(bytes, offset);
    if (!atom || atom.end > to) {
      break;
    }
    atoms.push(atom);
    offset = atom.end;
  }
  return atoms;
}

export function findChild(bytes: Uint8Array, parent: Atom, type: string): Atom | null {
  return (
    childAtoms(bytes, parent.start + parent.headerBytes, parent.end).find(
      (atom) => atom.type === type,
    ) ?? null
  );
}

/**
 * Descends a path of box types, e.g. `["udta", "meta", "ilst"]`.
 *
 * `meta` is a *full* box — four bytes of version and flags precede its children
 * — and it is the one box in the chain where that matters, so the walker
 * compensates for it by name rather than pretending all boxes are alike.
 */
export function findDescendant(
  bytes: Uint8Array,
  parent: Atom,
  path: readonly string[],
): Atom | null {
  let current: Atom | null = parent;
  for (const type of path) {
    if (!current) {
      return null;
    }
    const found = findChild(bytes, current, type);
    if (!found) {
      return null;
    }
    current =
      type === "meta" ? { ...found, start: found.start + 4, headerBytes: 0 } : found;
  }
  return current;
}

/**
 * Locates `moov` in a window that does not begin at the file's start.
 *
 * An M4A or M4B normally keeps its `moov` at the end, so a head window finds
 * only `ftyp` and `mdat`. The window's own offset is not box-aligned, so the
 * box is found by its four-character type and its size read from the four bytes
 * before it — where a box header always keeps it. The size is validated against
 * the real file length, because four bytes that happen to spell `moov` are
 * common enough inside compressed audio.
 */
export function scanForMoov(bytes: Uint8Array, fileSizeBytes: number, base: number): Atom | null {
  for (let offset = 4; offset + 8 <= bytes.length; offset += 1) {
    if (!matchesAscii(bytes, offset, "moov")) {
      continue;
    }
    const start = offset - 4;
    const size = readUint32BE(bytes, start);
    if (size < 8 || base + start + size > fileSizeBytes) {
      continue;
    }
    return { type: "moov", start, end: Math.min(bytes.length, start + size), headerBytes: 8 };
  }
  return null;
}
