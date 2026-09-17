/**
 * Recovers metadata from a filename.
 *
 * This is the fallback that makes the lecture use case work at all. Lecture
 * recordings, phone voice memos and ripped courses almost never carry ID3 tags,
 * but they are almost always named `03 - Thermodynamics.mp3` or
 * `2024-03-12 Lecture 4.mp3`. Without this, a folder of 40 lectures imports as
 * 40 files called "Audio recording 37".
 */

export type FilenameTags = {
  /** Cleaned title, or null when the stem carries no usable text. */
  title: string | null;
  trackNumber: number | null;
  year: number | null;
};

const EMPTY: FilenameTags = { title: null, trackNumber: null, year: null };

/** `2024-03-12 Lecture 4`, `2024.03.12 - Foo`, `20240312 Foo`. */
const DATE_PREFIX = /^(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})\s*[-_.]?\s*(.*)$/;
const COMPACT_DATE_PREFIX = /^(\d{4})(\d{2})(\d{2})\s*[-_.]?\s*(.*)$/;
/** `03 - Thermodynamics`, `03_Thermodynamics`, `03. Thermodynamics`. */
const LEADING_NUMBER = /^(\d{1,3})[\s\-–—_.]+(.+)$/;
/** `Thermodynamics - 03`. */
const TRAILING_NUMBER = /^(.+?)\s*[-–—_.]\s*(\d{1,3})$/;

export function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  // A leading dot is part of the name, not an extension separator.
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

function cleanTitle(value: string): string | null {
  const cleaned = value.replace(/[_]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function validMonthDay(month: string, day: string): boolean {
  const monthValue = Number.parseInt(month, 10);
  const dayValue = Number.parseInt(day, 10);
  return monthValue >= 1 && monthValue <= 12 && dayValue >= 1 && dayValue <= 31;
}

/**
 * A leading number is only a track number if what follows is not itself
 * numeric — otherwise `1984 Part One` reads as track 198 of "4 Part One".
 */
function leadingTrackNumber(value: string): { trackNumber: number; rest: string } | null {
  const match = LEADING_NUMBER.exec(value);
  if (!match) {
    return null;
  }
  const rest = match[2].trim();
  if (rest.length === 0 || /^\d/.test(rest)) {
    return null;
  }
  return { trackNumber: Number.parseInt(match[1], 10), rest };
}

export function readFilenameTags(fileName: string): FilenameTags {
  const stem = stripExtension(fileName).trim();
  if (stem.length === 0) {
    return EMPTY;
  }

  const dated = DATE_PREFIX.exec(stem) ?? COMPACT_DATE_PREFIX.exec(stem);
  if (dated && validMonthDay(dated[2], dated[3])) {
    const year = Number.parseInt(dated[1], 10);
    const rest = dated[4] ?? "";
    // `2024-03-12.mp3` keeps the date as the title rather than becoming untitled.
    const title = cleanTitle(rest) ?? stem;
    const numbered = leadingTrackNumber(title);
    return {
      title: numbered ? cleanTitle(numbered.rest) : title,
      trackNumber: numbered ? numbered.trackNumber : null,
      year,
    };
  }

  const leading = leadingTrackNumber(stem);
  if (leading) {
    return { title: cleanTitle(leading.rest), trackNumber: leading.trackNumber, year: null };
  }

  const trailing = TRAILING_NUMBER.exec(stem);
  if (trailing) {
    const title = cleanTitle(trailing[1]);
    if (title !== null) {
      return { title, trackNumber: Number.parseInt(trailing[2], 10), year: null };
    }
  }

  return { title: cleanTitle(stem), trackNumber: null, year: null };
}
