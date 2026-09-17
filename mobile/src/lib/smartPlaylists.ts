/**
 * Smart playlists: lists the listener did not have to build.
 *
 * Each recipe runs the same four stages.
 *
 *  1. **Filter** — which tracks are even eligible.
 *  2. **Score** — how much each one deserves a place.
 *  3. **Sequence** — the order they play in. Sometimes score order, sometimes
 *     not: a lecture series has to play in folder order, and a commute list has
 *     to fit a time budget.
 *  4. **Explain** — every pick carries a sentence saying why it is there.
 *
 * The explanation is not decoration. A recommendation the listener cannot
 * account for is indistinguishable from a bug, so a rule that cannot say why a
 * track is on the list is not allowed to put it there.
 *
 * Nothing here is persisted. A smart playlist is a *view* over the library, so
 * it stays true as the library changes; saving one is a separate, explicit act
 * that freezes the current picks into a real playlist.
 *
 * All pure — the caller supplies tracks, live sessions and a clock.
 */

import type { LocalSession, LocalTrack } from "@/lib/db/types";
import { dayKey, formatDuration } from "@/lib/history";
import { folderNameFromKey, orderFolderTracks } from "@/lib/mediaFolders";
import { hashString } from "@/lib/palette";
import { clampResumePosition } from "@/lib/resume";
import { formatClock } from "@/lib/time";

const DAY_MS = 86_400_000;

export type SmartRuleId = "continue" | "series" | "commute" | "forgotten" | "review";

export type SmartRule = {
  id: SmartRuleId;
  title: string;
  /** One line explaining what the list is for, shown on its card. */
  tagline: string;
};

export const SMART_RULES: readonly SmartRule[] = [
  {
    id: "continue",
    title: "Pick up",
    tagline: "Everything you stopped part-way through",
  },
  {
    id: "series",
    title: "Next in series",
    tagline: "The next lectures from the folders you are working through",
  },
  {
    id: "commute",
    title: "Fits your commute",
    tagline: "Filled to a time budget you choose",
  },
  {
    id: "forgotten",
    title: "Forgotten favourites",
    tagline: "Tracks you loved and have not touched in a while",
  },
  {
    id: "review",
    title: "Review your notes",
    tagline: "Tracks you annotated, stalest first",
  },
];

/** Time budgets offered for the commute rule, in seconds. */
export const COMMUTE_BUDGETS_SEC = [900, 1800, 2700, 3600] as const;
export const DEFAULT_COMMUTE_BUDGET_SEC = 1800;

export function ruleFor(id: SmartRuleId): SmartRule {
  const rule = SMART_RULES.find((candidate) => candidate.id === id);
  if (!rule) {
    throw new Error(`Unknown smart playlist rule: ${id}`);
  }
  return rule;
}

export function isSmartRuleId(value: string | undefined): value is SmartRuleId {
  return SMART_RULES.some((rule) => rule.id === value);
}

// --- History index --------------------------------------------------------

/**
 * What the recipes need to know about one track's past.
 *
 * Derived from the *live* session list rather than from the denormalised
 * `tracks.total_play_count` / `last_played_at` columns, so a recommendation and
 * the History screen can never disagree about how often something was played.
 */
export type TrackHistory = {
  /** Has at least one completed session — the same rule folder play uses. */
  finished: boolean;
  resumeSec: number;
  /** Finalized sessions only. */
  playCount: number;
  totalListenTimeSec: number;
  /** Most recent activity, including an in-progress session's start. */
  lastPlayedAt: number | null;
  firstPlayedAt: number | null;
};

export type SmartContext = {
  tracks: LocalTrack[];
  /** **Live** sessions — tombstones excluded. See `LocalDBService.getLiveSessions`. */
  sessions: LocalSession[];
  annotationCounts: Record<string, number>;
  now: number;
};

export type SmartPick = {
  track: LocalTrack;
  score: number;
  /** Why this track is on the list, in the listener's words. */
  reason: string;
};

export type SmartPlaylist = {
  rule: SmartRule;
  picks: SmartPick[];
  /** One sentence about the list as a whole. Empty when there are no picks. */
  summary: string;
  totalDurationSec: number;
  /** Set when the rule found nothing, phrased for the listener. */
  emptyReason: string | null;
};

export type SmartPlaylistOptions = {
  /** Time budget for `commute`, in seconds. */
  budgetSec?: number;
};

type HistoryIndex = Record<string, TrackHistory>;

function emptyHistory(): TrackHistory {
  return {
    finished: false,
    resumeSec: 0,
    playCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    firstPlayedAt: null,
  };
}

/**
 * Index access that admits the key may be absent.
 *
 * `noUncheckedIndexedAccess` is off in this project, so `index[id]` types as
 * `TrackHistory` even for a track that was never played. Reading through this
 * helper puts the `undefined` back in the type where the recipes need to branch
 * on it, instead of relying on a runtime check the compiler believes is dead.
 */
function historyOf(index: HistoryIndex, trackId: string): TrackHistory | undefined {
  return index[trackId];
}

/**
 * One pass over the sessions, then one over the resume candidates.
 *
 * "Finished" and "resumeSec" come from different sessions on purpose: the first
 * asks whether the track was *ever* heard to the end, the second where the
 * *latest* sitting left off. A track can be both — finished once, then reopened
 * and abandoned.
 */
export function buildTrackHistoryIndex(
  sessions: readonly LocalSession[],
  tracks: readonly LocalTrack[],
): HistoryIndex {
  const index: HistoryIndex = {};

  for (const session of sessions) {
    const entry = (index[session.trackId] ??= emptyHistory());
    const at = session.endedAt ?? session.startedAt;
    if (entry.lastPlayedAt === null || at > entry.lastPlayedAt) {
      entry.lastPlayedAt = at;
    }
    if (entry.firstPlayedAt === null || session.startedAt < entry.firstPlayedAt) {
      entry.firstPlayedAt = session.startedAt;
    }
    if (session.endedAt !== null) {
      entry.playCount += 1;
      entry.totalListenTimeSec += session.durationListenedSec;
      if (session.completed) {
        entry.finished = true;
      }
    }
  }

  const durationById = new Map(tracks.map((track) => [track.id, track.durationSec]));
  const latestEnd = new Map<string, { startedAt: number; endPositionSec: number }>();
  for (const session of sessions) {
    if (session.endedAt === null || session.endPositionSec === null) {
      continue;
    }
    const current = latestEnd.get(session.trackId);
    if (!current || session.startedAt >= current.startedAt) {
      latestEnd.set(session.trackId, {
        startedAt: session.startedAt,
        endPositionSec: session.endPositionSec,
      });
    }
  }

  for (const [trackId, latest] of latestEnd) {
    const entry = index[trackId];
    if (entry) {
      entry.resumeSec = clampResumePosition(latest.endPositionSec, durationById.get(trackId) ?? 0);
    }
  }

  return index;
}

// --- Shared helpers -------------------------------------------------------

/** Whole days between a timestamp and now, never negative. */
export function daysSince(timestampMs: number, now: number): number {
  return Math.max(0, Math.floor((now - timestampMs) / DAY_MS));
}

/**
 * Coarse recency phrasing for a reason line. Deliberately fuzzy — "3 weeks ago"
 * is what a person would say, and a precise date in a recommendation reads like
 * a log entry.
 */
export function describeRecency(timestampMs: number, now: number): string {
  const days = daysSince(timestampMs, now);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  if (days < 14) {
    return "last week";
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks} weeks ago`;
  }
  const months = Math.floor(days / 30);
  if (months <= 1) {
    return "last month";
  }
  if (months < 12) {
    return `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years <= 1 ? "a year ago" : `${years} years ago`;
}

/**
 * A stable ordering for tracks whose scores tie.
 *
 * Without this, ties resolve by whatever order the tracks arrived in, so the
 * same ten tracks would win every time and the list would look frozen. Seeding
 * with the rule and the calendar day keeps it varied day to day but identical
 * across re-renders and launches — a list that reshuffled while you looked at
 * it would be unusable.
 */
function tieBreak(ruleId: SmartRuleId, day: string, trackId: string): number {
  return hashString(`${ruleId}:${day}:${trackId}`);
}

function comparator(ruleId: SmartRuleId, day: string) {
  return (a: SmartPick, b: SmartPick): number =>
    b.score - a.score || tieBreak(ruleId, day, a.track.id) - tieBreak(ruleId, day, b.track.id);
}

/** Tracks whose bytes are reachable — a recommendation must be playable. */
function playable(tracks: readonly LocalTrack[]): LocalTrack[] {
  return tracks.filter((track) => track.availability !== "missing");
}

function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

// --- Rule 1: continue -----------------------------------------------------

const CONTINUE_LIMIT = 12;

/**
 * Recency-driven. "Unfinished" alone is not enough — a track that was opened
 * and closed at 0 s has no thread to pick up, so the filter also demands a
 * resume position.
 */
function buildContinue(context: SmartContext, index: HistoryIndex, day: string): SmartPick[] {
  const picks: SmartPick[] = [];

  for (const track of playable(context.tracks)) {
    const entry = historyOf(index, track.id);
    if (!entry || entry.finished || entry.resumeSec <= 0) {
      continue;
    }
    picks.push({
      track,
      score: entry.lastPlayedAt ?? 0,
      reason: `Left off at ${formatClock(entry.resumeSec)}`,
    });
  }

  return picks.sort(comparator("continue", day)).slice(0, CONTINUE_LIMIT);
}

// --- Rule 2: series -------------------------------------------------------

/** How many upcoming steps each folder contributes, so one series cannot fill the list. */
const SERIES_PER_FOLDER = 3;
const SERIES_FOLDER_LIMIT = 4;

type SeriesRun = {
  picks: SmartPick[];
  recency: number;
  folderKey: string;
};

/**
 * Sequence-driven: continuity beats score.
 *
 * This is the one rule that deliberately does **not** sort by score. A lecture
 * series is only useful in its own order, so folders are ranked (by how recently
 * you worked on them) and each then contributes its next few steps in folder
 * order.
 *
 * A finished track inside the window is skipped rather than replayed — folders
 * are worked through in order, not perfectly, and re-hearing a lecture you
 * already finished is worse than a gap.
 */
function buildSeries(context: SmartContext, index: HistoryIndex, day: string): SeriesRun[] {
  const byFolder = new Map<string, LocalTrack[]>();
  for (const track of playable(context.tracks)) {
    if (!track.folderKey) {
      continue;
    }
    const bucket = byFolder.get(track.folderKey);
    if (bucket) {
      bucket.push(track);
    } else {
      byFolder.set(track.folderKey, [track]);
    }
  }

  const runs: SeriesRun[] = [];

  for (const [folderKey, folderTracks] of byFolder) {
    // A single-file folder is not a series.
    if (folderTracks.length < 2) {
      continue;
    }
    const ordered = orderFolderTracks(folderTracks);
    const startIndex = ordered.findIndex((track) => !(historyOf(index, track.id)?.finished ?? false));
    // Everything finished: this series has no next step.
    if (startIndex < 0) {
      continue;
    }

    const previous = ordered[startIndex - 1];
    const picks: SmartPick[] = [];

    for (let offset = 0; offset < SERIES_PER_FOLDER; offset += 1) {
      const position = startIndex + offset;
      const track = ordered[position];
      if (!track || historyOf(index, track.id)?.finished) {
        continue;
      }
      const entry = historyOf(index, track.id);
      picks.push({
        track,
        score: ordered.length - position,
        reason:
          picks.length === 0
            ? previous
              ? `Next after "${previous.title}"`
              : `First in ${folderNameFromKey(folderKey)}`
            : entry && entry.resumeSec > 0
              ? `Left off at ${formatClock(entry.resumeSec)}`
              : `Step ${position + 1} of ${ordered.length}`,
      });
    }

    runs.push({
      picks,
      recency: folderTracks.reduce(
        (latest, track) => Math.max(latest, historyOf(index, track.id)?.lastPlayedAt ?? 0),
        0,
      ),
      folderKey,
    });
  }

  return runs.sort(
    (a, b) =>
      b.recency - a.recency ||
      tieBreak("series", day, a.folderKey) - tieBreak("series", day, b.folderKey),
  );
}

// --- Rule 3: commute ------------------------------------------------------

type CommuteCandidate = {
  track: LocalTrack;
  remainingSec: number;
  resuming: boolean;
};

/**
 * First-fit-decreasing into a single time budget.
 *
 * The intent is "something that fits the journey", not "pack the minutes" — a
 * single 28-minute lecture is a *better* answer for a 30-minute commute than
 * four short tracks that fill it exactly. So candidates are offered longest
 * first and the first one that fits is taken; the scan then continues to use up
 * whatever is left.
 *
 * This is a heuristic and knowingly leaves gaps: offered 20 + 18 + 12 minutes
 * for a 30-minute journey it takes the 20 and stops, even though 18 + 12 fills
 * the journey exactly. Solving that properly is a knapsack, and the gain is a
 * list that ends four minutes later — while the cost is a DP table sized by the
 * budget in seconds, run on every render. The summary reports the unused time
 * instead, so the trade is visible rather than hidden.
 */
export function fillToBudget<T extends { remainingSec: number }>(
  candidates: readonly T[],
  budgetSec: number,
): T[] {
  const picked: T[] = [];
  let used = 0;
  for (const candidate of candidates) {
    if (candidate.remainingSec > budgetSec - used) {
      continue;
    }
    picked.push(candidate);
    used += candidate.remainingSec;
  }
  return picked;
}

function commuteCandidates(
  context: SmartContext,
  index: HistoryIndex,
  budgetSec: number,
  day: string,
): CommuteCandidate[] {
  const candidates: CommuteCandidate[] = [];

  for (const track of playable(context.tracks)) {
    // A track whose length we have not learned yet (SAF reports no duration) is
    // excluded rather than assumed: "fits your commute" is a promise about
    // length, and we cannot make it without one.
    if (track.durationSec <= 0) {
      continue;
    }
    const entry = historyOf(index, track.id);
    if (entry?.finished) {
      continue;
    }
    const resumeSec = entry?.resumeSec ?? 0;
    const remainingSec = Math.max(1, track.durationSec - resumeSec);
    if (remainingSec > budgetSec) {
      continue;
    }
    candidates.push({ track, remainingSec, resuming: resumeSec > 0 });
  }

  return candidates.sort(
    (a, b) =>
      Number(b.resuming) - Number(a.resuming) ||
      b.remainingSec - a.remainingSec ||
      tieBreak("commute", day, a.track.id) - tieBreak("commute", day, b.track.id),
  );
}

// --- Rule 4: forgotten ----------------------------------------------------

const FORGOTTEN_MIN_PLAYS = 2;
const FORGOTTEN_MIN_DAYS = 21;
const FORGOTTEN_LIMIT = 12;

/**
 * Fondness weighted by absence: `plays × log2(2 + days)`.
 *
 * The logarithm is what makes this "forgotten *favourites*" rather than just
 * "forgotten". With a plain product, a track played twice a year ago (730) would
 * outrank one played fifteen times last month (450) — and the second is plainly
 * the one the listener would want back.
 */
export function forgottenScore(playCount: number, days: number): number {
  return playCount * Math.log2(2 + Math.max(0, days));
}

// --- Rule 5: review -------------------------------------------------------

const REVIEW_LIMIT = 12;

/** Same shape as `forgottenScore`: how much you marked, weighted by staleness. */
export function reviewScore(annotationCount: number, days: number): number {
  return annotationCount * Math.log2(2 + Math.max(0, days));
}

// --- Dispatcher -----------------------------------------------------------

type RuleResult = {
  picks: SmartPick[];
  summary: string;
  emptyReason: string | null;
};

function runRule(
  ruleId: SmartRuleId,
  context: SmartContext,
  index: HistoryIndex,
  options: SmartPlaylistOptions,
): RuleResult {
  const day = dayKey(context.now);

  switch (ruleId) {
    case "continue": {
      const picks = buildContinue(context, index, day);
      return {
        picks,
        summary: picks.length > 0 ? `${plural(picks.length, "track")} waiting where you stopped.` : "",
        emptyReason:
          picks.length > 0
            ? null
            : "Nothing is part-way through. Start something and it will show up here.",
      };
    }

    case "series": {
      const runs = buildSeries(context, index, day);
      const chosen = runs.slice(0, SERIES_FOLDER_LIMIT);
      const picks = chosen.flatMap((run) => run.picks);
      return {
        picks,
        summary:
          chosen.length > 0
            ? `${plural(chosen.length, "series", "series")} in progress · next ${plural(picks.length, "step")}.`
            : "",
        emptyReason:
          chosen.length > 0
            ? null
            : "No folder is part-way through yet. Play a track inside a folder to start a series.",
      };
    }

    case "commute": {
      const budget =
        options.budgetSec && options.budgetSec > 0
          ? options.budgetSec
          : DEFAULT_COMMUTE_BUDGET_SEC;
      const picked = fillToBudget(commuteCandidates(context, index, budget, day), budget);
      const used = picked.reduce((total, candidate) => total + candidate.remainingSec, 0);
      const spare = budget - used;
      return {
        picks: picked.map((candidate) => ({
          track: candidate.track,
          score: candidate.remainingSec,
          reason: candidate.resuming
            ? `${formatDuration(candidate.remainingSec)} left`
            : formatDuration(candidate.remainingSec),
        })),
        summary:
          picked.length > 0
            ? `${plural(picked.length, "track")} · ${formatDuration(used)} of ${formatDuration(budget)}${
                spare > 60 ? `, ${formatDuration(spare)} spare` : ""
              }.`
            : "",
        // An empty list has two very different causes, and telling them apart
        // matters: "your journey is too short" is actionable, "your library is
        // empty" is a different problem entirely.
        emptyReason:
          picked.length > 0
            ? null
            : playable(context.tracks).length === 0
              ? "Nothing in your library yet."
              : `Nothing fits ${formatDuration(budget)}. Try a longer journey.`,
      };
    }

    case "forgotten": {
      const scored: {
        track: LocalTrack;
        score: number;
        playCount: number;
        lastPlayedAt: number;
      }[] = [];

      for (const track of playable(context.tracks)) {
        const entry = historyOf(index, track.id);
        if (!entry || entry.playCount < FORGOTTEN_MIN_PLAYS || entry.lastPlayedAt === null) {
          continue;
        }
        const days = daysSince(entry.lastPlayedAt, context.now);
        if (days < FORGOTTEN_MIN_DAYS) {
          continue;
        }
        scored.push({
          track,
          score: forgottenScore(entry.playCount, days),
          playCount: entry.playCount,
          lastPlayedAt: entry.lastPlayedAt,
        });
      }

      const picks = scored
        .map((row) => ({
          track: row.track,
          score: row.score,
          reason: `${plural(row.playCount, "play")} · last heard ${describeRecency(row.lastPlayedAt, context.now)}`,
        }))
        .sort(comparator("forgotten", day))
        .slice(0, FORGOTTEN_LIMIT);

      return {
        picks,
        summary: picks.length > 0 ? `${plural(picks.length, "track")} worth another listen.` : "",
        emptyReason:
          picks.length > 0
            ? null
            : `Nothing has been played ${FORGOTTEN_MIN_PLAYS}+ times and then left alone for ${FORGOTTEN_MIN_DAYS} days.`,
      };
    }

    case "review": {
      const scored: {
        track: LocalTrack;
        score: number;
        notes: number;
        lastPlayedAt: number | null;
      }[] = [];

      for (const track of playable(context.tracks)) {
        const notes = context.annotationCounts[track.id] ?? 0;
        if (notes <= 0) {
          continue;
        }
        const lastPlayedAt = historyOf(index, track.id)?.lastPlayedAt ?? null;
        const days = lastPlayedAt === null ? 0 : daysSince(lastPlayedAt, context.now);
        scored.push({ track, score: reviewScore(notes, days), notes, lastPlayedAt });
      }

      const picks = scored
        .map((row) => ({
          track: row.track,
          score: row.score,
          reason:
            row.lastPlayedAt === null
              ? plural(row.notes, "note")
              : `${plural(row.notes, "note")} · last heard ${describeRecency(row.lastPlayedAt, context.now)}`,
        }))
        .sort(comparator("review", day))
        .slice(0, REVIEW_LIMIT);

      return {
        picks,
        summary: picks.length > 0 ? `${plural(picks.length, "track")} you took notes on.` : "",
        emptyReason:
          picks.length > 0
            ? null
            : "No track has notes yet. Add one while listening and it lands here.",
      };
    }
  }
}

function assemble(
  ruleId: SmartRuleId,
  context: SmartContext,
  index: HistoryIndex,
  options: SmartPlaylistOptions,
): SmartPlaylist {
  const result = runRule(ruleId, context, index, options);
  return {
    rule: ruleFor(ruleId),
    picks: result.picks,
    summary: result.summary,
    totalDurationSec: result.picks.reduce((total, pick) => total + pick.track.durationSec, 0),
    emptyReason: result.emptyReason,
  };
}

export function buildSmartPlaylist(
  ruleId: SmartRuleId,
  context: SmartContext,
  options: SmartPlaylistOptions = {},
): SmartPlaylist {
  return assemble(ruleId, context, buildTrackHistoryIndex(context.sessions, context.tracks), options);
}

/**
 * Builds several rules over one history index.
 *
 * The index is a full pass over every session, so the Playlists tab — which
 * shows a pick count for all five recipes — must not pay for it five times.
 */
export function buildSmartPlaylists(
  ruleIds: readonly SmartRuleId[],
  context: SmartContext,
  options: SmartPlaylistOptions = {},
): SmartPlaylist[] {
  const index = buildTrackHistoryIndex(context.sessions, context.tracks);
  return ruleIds.map((ruleId) => assemble(ruleId, context, index, options));
}
