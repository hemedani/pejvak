/**
 * The Internet Archive's languages, as pure data.
 *
 * Split from the adapter on purpose: the language catalogue and the Browse tab
 * need this table on the client, while the adapter that queries the archive is
 * server-only. A language is not one facet value — the archive files an item
 * under its English name (`Persian`) *or* its ISO 639-2 code (`per`, `fas`),
 * and the three sets are disjoint: `Persian` alone matches 91 items, while the
 * union matches 2,194 — and the most-downloaded Persian item of all
 * (`radioDaal`, 1.2 million downloads) is filed only under `per`. So a language
 * is queried as an OR across every spelling it is known by.
 */

import type { OnlineSource } from "@/lib/online/types";

const BASE_URL = "https://archive.org";

/** The slug prefix every language's source id carries: `archive-fa`. */
const SOURCE_PREFIX = "archive-";

/**
 * A language, as the archive files it.
 *
 * `facets` is every spelling the archive uses for this language, and it is a
 * list rather than a name because the archive's own vocabulary is inconsistent:
 * see the note at the top of this file. A language is missing from the browse
 * list unless it appears here.
 */
type ArchiveLanguage = {
  /** Our code, and the language's half of the source id (`archive-fa`). */
  code: string;
  /** The name the archive indexes this language under, for display. */
  name: string;
  /** The English name, the ISO 639-1 code, and both ISO 639-2 codes. */
  facets: readonly string[];
};

/**
 * The spellings the archive files a language under.
 *
 * Exported so search can index the ISO 639-2 codes the listener may type — a
 * catalogue entry says "Persian", but the archive also answers to `per` and
 * `fas`, and those are not the same word.
 */
export function archiveLanguageFacets(code: string): readonly string[] {
  return ARCHIVE_LANGUAGES.find((language) => language.code === code)?.facets ?? [];
}

/**
 * Every language the archive can serve, with the facets verified against the
 * live search API.
 *
 * Ordered by our own language code, which is the ISO 639-1 code for all of
 * them. Where ISO 639-2 has two forms — a bibliographic one (`per`) and a
 * terminology one (`fas`) — both are listed, because the archive uses both.
 */
export const ARCHIVE_LANGUAGES: readonly ArchiveLanguage[] = [
  { code: "ar", name: "Arabic", facets: ["Arabic", "ar", "ara"] },
  { code: "az", name: "Azerbaijani", facets: ["Azerbaijani", "az", "aze"] },
  { code: "bn", name: "Bengali", facets: ["Bengali", "bn", "ben"] },
  { code: "my", name: "Burmese", facets: ["Burmese", "my", "bur", "mya"] },
  { code: "zh", name: "Chinese", facets: ["Chinese", "zh", "chi", "zho"] },
  { code: "cs", name: "Czech", facets: ["Czech", "cs", "cze", "ces"] },
  { code: "da", name: "Danish", facets: ["Danish", "da", "dan"] },
  { code: "nl", name: "Dutch", facets: ["Dutch", "nl", "dut", "nld"] },
  { code: "en", name: "English", facets: ["English", "en", "eng"] },
  { code: "fi", name: "Finnish", facets: ["Finnish", "fi", "fin"] },
  { code: "fr", name: "French", facets: ["French", "fr", "fre", "fra"] },
  { code: "de", name: "German", facets: ["German", "de", "ger", "deu"] },
  { code: "el", name: "Greek", facets: ["Greek", "el", "gre", "ell"] },
  { code: "he", name: "Hebrew", facets: ["Hebrew", "he", "heb"] },
  { code: "hi", name: "Hindi", facets: ["Hindi", "hi", "hin"] },
  { code: "hu", name: "Hungarian", facets: ["Hungarian", "hu", "hun"] },
  { code: "id", name: "Indonesian", facets: ["Indonesian", "id", "ind"] },
  { code: "it", name: "Italian", facets: ["Italian", "it", "ita"] },
  { code: "ja", name: "Japanese", facets: ["Japanese", "ja", "jpn"] },
  { code: "kk", name: "Kazakh", facets: ["Kazakh", "kk", "kaz"] },
  { code: "ko", name: "Korean", facets: ["Korean", "ko", "kor"] },
  { code: "ku", name: "Kurdish", facets: ["Kurdish", "ku", "kur"] },
  { code: "ms", name: "Malay", facets: ["Malay", "ms", "may", "msa"] },
  { code: "ml", name: "Malayalam", facets: ["Malayalam", "ml", "mal"] },
  { code: "mr", name: "Marathi", facets: ["Marathi", "mr", "mar"] },
  { code: "no", name: "Norwegian", facets: ["Norwegian", "no", "nor"] },
  { code: "ps", name: "Pashto", facets: ["Pashto", "ps", "pus"] },
  { code: "fa", name: "Persian", facets: ["Persian", "fa", "per", "fas"] },
  { code: "pl", name: "Polish", facets: ["Polish", "pl", "pol"] },
  { code: "pt", name: "Portuguese", facets: ["Portuguese", "pt", "por"] },
  { code: "pa", name: "Punjabi", facets: ["Punjabi", "pa", "pan"] },
  { code: "ro", name: "Romanian", facets: ["Romanian", "ro", "rum", "ron"] },
  { code: "ru", name: "Russian", facets: ["Russian", "ru", "rus"] },
  { code: "sr", name: "Serbian", facets: ["Serbian", "sr", "srp"] },
  { code: "si", name: "Sinhala", facets: ["Sinhala", "si", "sin"] },
  { code: "es", name: "Spanish", facets: ["Spanish", "es", "spa"] },
  { code: "sv", name: "Swedish", facets: ["Swedish", "sv", "swe"] },
  { code: "tl", name: "Tagalog", facets: ["Tagalog", "tl", "tgl"] },
  { code: "ta", name: "Tamil", facets: ["Tamil", "ta", "tam"] },
  { code: "te", name: "Telugu", facets: ["Telugu", "te", "tel"] },
  { code: "th", name: "Thai", facets: ["Thai", "th", "tha"] },
  { code: "tr", name: "Turkish", facets: ["Turkish", "tr", "tur"] },
  { code: "uk", name: "Ukrainian", facets: ["Ukrainian", "uk", "ukr"] },
  { code: "ur", name: "Urdu", facets: ["Urdu", "ur", "urd"] },
  { code: "uz", name: "Uzbek", facets: ["Uzbek", "uz", "uzb"] },
  { code: "vi", name: "Vietnamese", facets: ["Vietnamese", "vi", "vie"] },
];

/** The language codes this source serves — read by the language catalogue. */
export const ARCHIVE_LANGUAGE_CODES: ReadonlySet<string> = new Set(
  ARCHIVE_LANGUAGES.map((language) => language.code),
);

/**
 * One source per language, rather than one source that changes language.
 *
 * A source is a fixed piece of data and its id is baked into every collection
 * key the listener saves, so a single `archive` source would either have to
 * carry a language that changes under it or lose the language from a saved
 * course's identity. One source per language keeps both stable: a course saved
 * from the Persian list stays a Persian course.
 */
export function archiveSources(): OnlineSource[] {
  return ARCHIVE_LANGUAGES.map((language) => ({
    id: `${SOURCE_PREFIX}${language.code}`,
    kind: "archive",
    name: "Internet Archive",
    nativeName: "Internet Archive",
    languageCode: language.code,
    homepage: `${BASE_URL}/search?query=${encodeURIComponent(`language:("${language.name}")`)}`,
    description: `Public audio in ${language.name}, free to stream.`,
  }));
}
