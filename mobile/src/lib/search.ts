/**
 * Finding a name in a library.
 *
 * Search is the one thing a library of a few thousand files cannot do without,
 * and in this app it has a specific problem to solve before it solves anything
 * else: the same Persian word is written several ways. «ماجراي شيعه» with an
 * Arabic yeh and «ماجرای شیعه» with a Persian one are the same title, and a
 * ZWNJ (نیمفاصله) is invisible but significant. Comparing raw bytes would find
 * neither, so **everything is folded before it is compared** — letters
 * normalised, invisible characters dropped, digits converted.
 *
 * The fold is deliberately lossy in one direction only: it merges spellings
 * that mean the same thing, and never merges two different words. It is applied
 * to the query and the haystack alike, which is what makes «قسمت ۱» and
 * «قسمت 1» match each other.
 *
 * The other half is *ranking*. A listener typing a name wants that name, not
 * every row that happens to contain those letters, so **how well** a row matched
 * decides its place before **which field** it matched in does: a prefix beats a
 * word beats a substring, wherever they were found. The field is the
 * tie-breaker — at equal quality the title wins, because that is the field the
 * listener is reading — and past that rows keep the caller's order, so a
 * filtered list stays in the order the screen already showed it in.
 *
 * ## The one spelling this does not merge
 *
 * A ZWNJ folds to nothing rather than to a space. That makes a ZWNJ title and a
 * joined one the same word, and it leaves a *spaced* title («نیم فاصله»)
 * reachable only by a spaced query: five of the six combinations between the
 * three spellings work, and the sixth is a joined query against a spaced title.
 * Closing that needs a second, space-free form of every field to fall back on —
 * a real cost in memory, and it would lose the word boundaries the ranking
 * depends on — so it is left open deliberately, and written down here so the
 * next session finds a known boundary rather than a bug.
 *
 * ## Why an index
 *
 * Folding is not free — it walks a string character by character and builds two
 * arrays — and a keystroke would otherwise fold the whole library again: a few
 * thousand tracks across seven fields is tens of thousands of folds, on the JS
 * thread, while the keyboard is open. So the fold is done **once per data
 * load** by `createSearchIndex`, and a query only ever runs `indexOf` against
 * strings that are already folded. Typing stays cheap no matter how large the
 * library gets, which is the difference between a search field and a search
 * field that stutters.
 */

/** Presentation variants: the same letter as typed on different keyboards. */
const LETTER_FOLD: Record<string, string> = {
  // Arabic yeh/kaf → the Persian letters they are always meant to be.
  "ي": "ی",
  "ى": "ی",
  "ك": "ک",
  // Hamza carriers, folded to their bare letter. Recall over precision: a
  // listener who types «ارام» means «آرام», and a search that answers "no
  // results" to a near-miss has failed at the only thing it does.
  "أ": "ا",
  "إ": "ا",
  "آ": "ا",
  "ٱ": "ا",
  "ة": "ه",
  "ۀ": "ه",
  "ؤ": "و",
};

/** Persian and Arabic-Indic digits → ASCII, so «۱۲۰۰» finds «1200». */
const DIGIT_FOLD: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/**
 * Zero-width joiner/non-joiner and tatweel: present in the data, never seen.
 *
 * A ZWNJ is dropped rather than turned into a space — see the note at the top
 * of this file for the one case that leaves unmatched.
 */
const INVISIBLE = new Set(["\u200b", "\u200c", "\u200d", "\u0640"]);
/** Harakat and the like — a title with them is the same title without. */
const DIACRITIC = /[\u064B-\u0652\u0670\u06D6-\u06ED]/;

function foldChar(char: string): string | null {
  if (INVISIBLE.has(char) || DIACRITIC.test(char)) {
    return null;
  }
  const mapped = LETTER_FOLD[char] ?? DIGIT_FOLD[char];
  // Latin folds too, so "Track 1" is findable as "track 1".
  return mapped ?? char.toLowerCase();
}

export type Folded = {
  /** The comparison form: folded, whitespace collapsed, trimmed. */
  text: string;
  /** `map[i]` is the index in the original string that `text[i]` came from. */
  map: number[];
};

/**
 * Folds a string for comparison, keeping a trail back to the original.
 *
 * The map exists so a match found in the folded text can be reported as a range
 * in the *original*, which is what lets a row highlight the matched run without
 * re-deriving it — the whole reason to fold per character rather than with a
 * handful of `replace` calls.
 */
export function fold(input: string): Folded {
  const chars: string[] = [];
  const map: number[] = [];
  let sawSpace = false;

  for (let index = 0; index < input.length; index += 1) {
    const raw = input[index];
    if (/\s/.test(raw)) {
      // Collapsed rather than dropped: "a  b" and "a b" are one query.
      sawSpace = chars.length > 0;
      continue;
    }
    const folded = foldChar(raw);
    if (folded === null) {
      continue;
    }
    if (sawSpace) {
      chars.push(" ");
      map.push(index);
      sawSpace = false;
    }
    for (const char of folded) {
      chars.push(char);
      map.push(index);
    }
  }

  return { text: chars.join(""), map };
}

/** The comparison form of a whole string. */
export function foldText(input: string): string {
  return fold(input).text;
}

/** The comparison form of a query, split into the terms all of which must hit. */
export function foldQuery(query: string): string[] {
  const folded = foldText(query);
  return folded.length > 0 ? folded.split(" ") : [];
}

export type MatchQuality = "exact" | "prefix" | "word" | "substring";

/** Higher is a better answer. `0` means "does not match at all". */
const QUALITY_RANK: Record<MatchQuality, number> = {
  exact: 4,
  prefix: 3,
  word: 2,
  substring: 1,
};

export type Range = { start: number; end: number };

export type Match = {
  quality: MatchQuality;
  /** Where the terms hit, as indices into the **original** string. */
  ranges: Range[];
  /** Index of the earliest hit, for tie-breaking. */
  position: number;
};

/**
 * How well one folded term hits one folded haystack.
 *
 * `word` needs a space before the term rather than a regex word boundary: the
 * scripts involved have no `\b`, and the folded text is already whitespace-
 * normalised, so a space is the honest test.
 */
function qualityOf(haystack: string, term: string): MatchQuality | null {
  const at = haystack.indexOf(term);
  if (at < 0) {
    return null;
  }
  if (haystack === term) {
    return "exact";
  }
  if (at === 0) {
    return "prefix";
  }
  return haystack[at - 1] === " " ? "word" : "substring";
}

/**
 * Matches a query against an already-folded string.
 *
 * Every term must hit (AND), which is what makes a two-word query narrow rather
 * than widen — «تاریخ ایران» should not return every row containing «تاریخ».
 * The quality reported is the *best* term's, because a query is as good as its
 * strongest evidence, while the position is the *earliest* hit so equally-good
 * rows sort by where the match sits in the title.
 */
export function matchFolded(haystack: Folded, terms: readonly string[]): Match | null {
  if (terms.length === 0) {
    return null;
  }
  const ranges: Range[] = [];
  let best: MatchQuality | null = null;
  let position = Number.MAX_SAFE_INTEGER;

  for (const term of terms) {
    const quality = qualityOf(haystack.text, term);
    if (quality === null) {
      return null;
    }
    if (best === null || QUALITY_RANK[quality] > QUALITY_RANK[best]) {
      best = quality;
    }
    // Only the first occurrence of each term is highlighted. A term repeated
    // five times in one title is noise, not information.
    const at = haystack.text.indexOf(term);
    const start = haystack.map[at];
    const end = haystack.map[at + term.length - 1] + 1;
    ranges.push({ start, end });
    position = Math.min(position, start);
  }

  ranges.sort((left, right) => left.start - right.start);
  return { quality: best ?? "substring", ranges, position };
}

/** Matches a query against a raw string. Folds it first — see `createSearchIndex`. */
export function matchOne(haystack: string, terms: readonly string[]): Match | null {
  return matchFolded(fold(haystack), terms);
}

/** A field a row can be found by, and the label to tell the listener which. */
export type SearchFieldName =
  | "title"
  | "author"
  | "album"
  | "narrator"
  | "fileName"
  | "folder"
  | "path"
  | "description";

export function describeField(field: SearchFieldName): string {
  switch (field) {
    case "author":
      return "author";
    case "album":
      return "album";
    case "narrator":
      return "narrator";
    case "fileName":
      return "file name";
    case "folder":
      return "folder";
    case "path":
      return "path";
    case "description":
      return "description";
    default:
      return "title";
  }
}

export type Hit<Item, Field extends string> = {
  item: Item;
  /** Which field produced the best match — worth showing, since a hit the
   *  listener cannot see in the title looks like a bug otherwise. */
  field: Field;
  /** That field's own text, so a row can say what it matched on. */
  value: string;
  quality: MatchQuality;
  /** Ranges within the title, for highlighting. Empty when another field won. */
  ranges: Range[];
};

/** What a caller must say about an item for it to be searchable. */
export type SearchFieldSpec<Item, Field extends string> = (
  item: Item,
) => readonly { field: Field; value: string | null }[];

/** One item's fields, folded once and kept. */
export type SearchIndexEntry<Item, Field extends string> = {
  item: Item;
  titleField: Field;
  fields: readonly { field: Field; value: string; folded: Folded }[];
};

/**
 * Folds every searchable field of every item, once.
 *
 * Call it from a `useMemo` keyed on the data rather than per keystroke — that is
 * the entire reason it exists. An empty or absent field is dropped here instead
 * of being tested later, so the match loop only ever sees real text.
 */
export function createSearchIndex<Item, Field extends string>(
  items: readonly Item[],
  fieldsOf: SearchFieldSpec<Item, Field>,
  titleField: Field,
): SearchIndexEntry<Item, Field>[] {
  return items.map((item) => {
    const fields: { field: Field; value: string; folded: Folded }[] = [];
    for (const entry of fieldsOf(item)) {
      // A falsy test rather than `=== null`: a field built with `??` can come
      // out `undefined` when both alternatives are absent, and `undefined`
      // reaching the `.length` below would throw rather than skip.
      if (!entry.value) {
        continue;
      }
      fields.push({ field: entry.field, value: entry.value, folded: fold(entry.value) });
    }
    return { item, titleField, fields };
  });
}

/**
 * Runs a query over an index, keeping the caller's order within equal scores.
 *
 * Generic over the item and the field union so `tracks` and `folders` share one
 * implementation — the ranking rule is a property of searching, not of what is
 * being searched, and two copies of it would eventually rank differently.
 */
export function searchIndex<Item, Field extends string>(
  entries: readonly SearchIndexEntry<Item, Field>[],
  terms: readonly string[],
): Hit<Item, Field>[] {
  if (terms.length === 0) {
    return [];
  }

  const scored: { hit: Hit<Item, Field>; position: number; order: number }[] = [];
  for (let order = 0; order < entries.length; order += 1) {
    const entry = entries[order];
    let best: Hit<Item, Field> | null = null;
    let bestPosition = Number.MAX_SAFE_INTEGER;

    for (const { field, value, folded } of entry.fields) {
      const match = matchFolded(folded, terms);
      if (match === null) {
        continue;
      }
      const candidate: Hit<Item, Field> = {
        item: entry.item,
        field,
        value,
        quality: match.quality,
        ranges: field === entry.titleField ? match.ranges : [],
      };
      // Better quality wins outright, wherever it was found. At equal quality
      // the title wins — it is the field the listener is reading, and it is the
      // only field that carries ranges to highlight, so letting an author that
      // happens to match nearer the start of *its own* string take the hit would
      // throw the highlight away and show nothing in its place.
      const better =
        best === null ||
        QUALITY_RANK[candidate.quality] > QUALITY_RANK[best.quality] ||
        (candidate.quality === best.quality && field === entry.titleField);
      if (better) {
        best = candidate;
        bestPosition = match.position;
      }
    }

    if (best !== null) {
      scored.push({ hit: best, position: bestPosition, order });
    }
  }

  return scored
    .sort(
      (left, right) =>
        QUALITY_RANK[right.hit.quality] - QUALITY_RANK[left.hit.quality] ||
        left.position - right.position ||
        left.order - right.order,
    )
    .map(({ hit }) => hit);
}

/** `createSearchIndex` then `searchIndex` — for small lists and for tests. */
export function searchItems<Item, Field extends string>(
  items: readonly Item[],
  terms: readonly string[],
  fieldsOf: SearchFieldSpec<Item, Field>,
  titleField: Field,
): Hit<Item, Field>[] {
  return searchIndex(createSearchIndex(items, fieldsOf, titleField), terms);
}

/** Splits a string into runs to render, marking the ones a query matched. */
export function highlight(
  text: string,
  ranges: readonly Range[],
): { text: string; matched: boolean }[] {
  if (ranges.length === 0) {
    return [{ text, matched: false }];
  }
  const segments: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) {
      continue;
    }
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), matched: false });
    }
    segments.push({ text: text.slice(range.start, range.end), matched: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matched: false });
  }
  return segments;
}
