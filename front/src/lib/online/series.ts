/**
 * The series inside an online collection.
 *
 * A category on manahej.ir is a *shelf*, not a course. «تاریخ شیعه» holds 57
 * episodes that are really nine series, and the source's playlist query includes
 * descendants — so opening it interleaves «ماجرای شیعه» with «تاریخ از زبان علی»
 * and «نیزههای کاغذی» by publish date. Nine shows arrive shuffled into one list,
 * and the listener has no way to see where one ends and the next begins.
 *
 * There is no series id to group by. All 82 categories on the site are flat,
 * `radio` has eleven children and no grandchildren, and the only place a series
 * exists at all is in the episode title. So the grouping is a *reading* of that
 * title — and because titles are hostile input, everything here is pure and the
 * reading is pinned by tests against the shapes the live data actually has.
 *
 * **A series is not a collection.** It would have been possible to give each one
 * its own key, its own download folder and its own progress, and that would have
 * been wrong: the source hands out no series id, so the key would have to be
 * derived from a mutable Persian title — and this project's own invariant is that
 * an item's identity is *the source's own id for it*, never something computed
 * from a string. A title edited upstream would split a saved series in two and
 * orphan its downloads. So the collection stays the unit that syncs, downloads
 * and remembers progress; a series is a section *of* it, a way of reading one
 * list.
 *
 * ## Reading the title
 *
 * Three steps, each of which the live data needs:
 *
 *   1. **A part marker.** «پادپخش تاریخ قیام سیدالشهدا - قسمت 1» and
 *      «نیزههای کاغذی - قسمت 1 - حمله به افکار تو» — the marker may be last or
 *      followed by a subtitle, and the separator in front of it may be `-`, `–`
 *      or nothing at all. Everything before it is the series.
 *   2. **A bare trailing number.** «تاریخ تمدن انسان» and «تاریخ تمدن انسان
 *      1/2/3» are one series whose later parts never say "part".
 *   3. **A trailing subtitle — on evidence only.** «مصطفی» (23 episodes) and
 *      «مصطفی - ماجرای بلال» (1) are the same series, split only because the
 *      marker is absent. Cutting *every* title at its last ` - ` would fold those
 *      together, and would also fold «تاریخ ایران - قاجار» into «تاریخ ایران -
 *      پهلوی» — two different shows. So the cut is made only when the prefix is
 *      *itself* a series somewhere in this collection. The rule then fires
 *      exactly when it changes something, and never on a guess.
 *
 * ## Why the fold, and why the label is not folded
 *
 * Grouping compares Persian, so it compares folded text — Arabic yeh and kaf,
 * ZWNJ and the Persian digits are the same words written differently, and a raw
 * comparison finds exactly one spelling of each (see `lib/search.ts`). The fold
 * is applied to the *key* only. The label keeps the source's own spelling,
 * because a ZWNJ folds to nothing rather than to a space, and printing the folded
 * form would quietly rewrite «نیمفاصله» as «نیمفاصله».
 *
 * ## Singletons are the point, not an edge case
 *
 * «خلاصه کتاب» is 29 tracks that are 25 series, 22 of them one-offs — a book
 * summary is one per book. A grouping that rendered those as 22 sections of one
 * would be worse than the flat list it replaced, so **only groups of two or more
 * become sections**, and everything else falls through to a single trailing
 * bucket. A caller can therefore treat "one section, and it is the standalone
 * bucket" as "grouping did not help here" and render the flat list instead.
 */

import { foldText } from "@/lib/search";

/**
 * The trailing bucket's key.
 *
 * A NUL byte cannot occur in a title, so this can never collide with a real
 * series — which matters because the bucket is identified by its key, not by the
 * `standalone` flag, and a collision would silently swallow a show.
 */
export const STANDALONE_KEY = "\u0000standalone";

/** The trailing bucket's label. The app's own voice, so it is not Persian. */
export const STANDALONE_TITLE = "Standalone episodes";

/** ASCII, Arabic-Indic and Persian digits — the label is read *before* folding. */
const DIGITS = "0-9\\u0660-\\u0669\\u06F0-\\u06F9";

/**
 * A part marker and its number.
 *
 * The separator in front is part of the match, so slicing at `index` drops it
 * along with the marker and leaves no dangling dash to clean up afterwards.
 * `قسمت` is the word the source actually uses; the rest are here because a
 * source is data and not a promise.
 */
const PART_MARKER = new RegExp(
  `(?:^|[\\s\\-\\u2013\\u2014])(?:قسمت|بخش|پارت|part|episode|ep)\\.?\\s*[${DIGITS}]+`,
  "i",
);

/** A trailing number with no word for "part" in front of it. */
const TRAILING_NUMBER = new RegExp(`[\\s\\-\\u2013\\u2014]+[${DIGITS}]+\\s*$`);

/** What a cut can leave dangling: dashes, spaces, the Persian and Latin commas. */
const DANGLING = /[\s\-\u2013\u2014\u00B7\u060C:,]+$/;

/** A subtitle separator: a dash with whitespace on both sides. */
const SUBTITLE_SEPARATOR = /\s[\-\u2013\u2014]\s/g;

/**
 * The series name an episode title belongs to.
 *
 * Returns the title's own spelling. Folding happens in `buildSeriesSections`,
 * where it belongs to the comparison rather than to the name.
 */
export function seriesNameOf(title: string): string {
  const cleaned = title.replace(/\s+/g, " ").trim();
  const marker = PART_MARKER.exec(cleaned);
  // A title that *begins* with the marker carries no series name at all — and
  // stripping its number would leave the bare word «قسمت», which would then
  // gather every such title into one invented series. Keeping the whole title is
  // the honest answer, and it stays a singleton.
  if (marker && marker.index === 0) {
    return cleaned;
  }
  const head = marker ? cleaned.slice(0, marker.index) : cleaned;
  const trimmed = head.replace(TRAILING_NUMBER, "").replace(DANGLING, "").trim();
  return trimmed.length > 0 ? trimmed : cleaned;
}

/** The last subtitle separator in a name, or null when it has none. */
function lastSubtitleCut(name: string): number | null {
  let last: number | null = null;
  // `lastIndex` is state on a global regex, so it is reset before every scan —
  // otherwise the second call would start wherever the first one stopped.
  SUBTITLE_SEPARATOR.lastIndex = 0;
  let match = SUBTITLE_SEPARATOR.exec(name);
  while (match !== null) {
    last = match.index;
    match = SUBTITLE_SEPARATOR.exec(name);
  }
  return last;
}

/**
 * Fold a trailing subtitle away, but only when what remains is a series here.
 *
 * `present` is every strict name in this collection. Requiring the prefix to be
 * in it is what keeps the rule from inventing a group: if «مصطفی» is a series
 * here, «مصطفی - ماجرای بلال» belongs to it; if nothing is called «تاریخ ایران»,
 * then «تاریخ ایران - قاجار» and «تاریخ ایران - پهلوی» stay two shows.
 *
 * One level, not a loop. A second cut could only fire on a name whose prefix is
 * *also* a subtitle-bearing series here, and the collection that produces one is
 * not a shape the source has.
 */
function withSubtitleFolded(name: string, present: ReadonlySet<string>): string {
  const cut = lastSubtitleCut(name);
  if (cut === null) {
    return name;
  }
  const prefix = name.slice(0, cut).replace(DANGLING, "").trim();
  if (prefix.length === 0) {
    return name;
  }
  return present.has(foldText(prefix)) ? prefix : name;
}

/** One series — or the trailing bucket — as the screen renders it. */
export type SeriesSection<T> = {
  /** The folded name. Stable within one call, and only within one call. */
  key: string;
  /** The series as the source spelled it. */
  title: string;
  /** The episodes, in the collection's own order. */
  tracks: T[];
  /** The trailing bucket of episodes that belong to no series. */
  standalone: boolean;
};

/**
 * Group a collection's tracks into the series they actually are.
 *
 * Sections come back in the order their *first* episode does, so the shelf keeps
 * the collection's own ordering rather than being re-sorted by size — a listener
 * who was part-way down the list finds the shows where they left them. The
 * standalone bucket is always last.
 *
 * Returns `[]` for an empty collection, and a single standalone section when no
 * group reached two — which is the caller's signal that there was nothing to
 * group.
 */
export function buildSeriesSections<T extends { title: string }>(
  tracks: readonly T[],
): SeriesSection<T>[] {
  const names = tracks.map((track) => seriesNameOf(track.title));
  const present = new Set(names.map(foldText));

  // Insertion-ordered, so first appearance is the collection's order and no
  // separate sort is needed.
  const groups = new Map<string, SeriesSection<T>>();
  tracks.forEach((track, index) => {
    const name = withSubtitleFolded(names[index], present);
    const key = foldText(name);
    const existing = groups.get(key);
    if (existing) {
      existing.tracks.push(track);
    } else {
      groups.set(key, { key, title: name, tracks: [track], standalone: false });
    }
  });

  const sections: SeriesSection<T>[] = [];
  const standalone: T[] = [];
  for (const section of groups.values()) {
    if (section.tracks.length > 1) {
      sections.push(section);
    } else {
      standalone.push(section.tracks[0]);
    }
  }

  if (standalone.length > 0) {
    sections.push({
      key: STANDALONE_KEY,
      title: STANDALONE_TITLE,
      tracks: standalone,
      standalone: true,
    });
  }

  return sections;
}
