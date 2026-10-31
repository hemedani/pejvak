/**
 * One listening stretch, as a row.
 *
 * A stretch is the thing a listener remembers — "chapter 4 to chapter 7, thirty-
 * eight minutes" — where eight session rows for one commute read as eight
 * listens. So the row names both ends, sums the time, and carries **one**
 * verdict, derived from all of its members.
 *
 * ## Why the row is not a link
 *
 * It represents several tracks, so a single destination would be arbitrary. The
 * two track names are the links, each to its own page; the resume control is a
 * sibling of them, never nested inside one. The whole row is a list item, not an
 * anchor, so a tap on the title does not silently open the wrong chapter.
 *
 * ## One verdict, in one place
 *
 * `completed`, `interrupted` and `seeked` are the phone's, reported rather than
 * recomputed (`lib/history.ts` explains why). The badge is the only place the
 * outcome appears: not also as a border, a wash, or a second caption. Two
 * renderings of one fact is how they start disagreeing.
 *
 * There is no delete control, and its absence is deliberate: the web has no act
 * for it, and the phone owns removal. A disabled button would promise a feature.
 */

import Link from "next/link";

import { ResumeListenButton } from "@/components/domain/resume-listen-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { isPlayableOnWeb } from "@/lib/domain/track";
import { formatSpeed, formatSpan } from "@/lib/format";
import {
  describeStretchTracks,
  describeStretchTitle,
  describeStretchVerdict,
  formatStretchPositionRange,
  formatStretchTimeRange,
  stretchResumeTarget,
  stretchTitleParts,
  type ListeningStretch,
} from "@/lib/history";
import { findSource, parseCollectionKey } from "@/lib/online";

export function HistoryRow({
  stretch,
  divided = false,
}: {
  stretch: ListeningStretch;
  /** Draws the hairline above the row — every row but a day's first. */
  divided?: boolean;
}) {
  const title = stretchTitleParts(stretch);
  const verdict = describeStretchVerdict(stretch);
  const tracks = describeStretchTracks(stretch);
  const positionRange = formatStretchPositionRange(stretch);
  const first = stretch.members[0] ?? null;
  const last = stretch.members[stretch.members.length - 1] ?? null;

  // The relation is the row's own knowledge, so nothing has to be fetched to
  // know the control cannot work.
  const playable = first?.track ? isPlayableOnWeb(first.track) : false;
  // Static source data, not the runtime registry: the registry is populated on
  // the client after mount, and reading it here would render one label on the
  // server and another after hydration.
  const live = findSource(first?.track?.sourceId ?? "")?.live === true;

  const resume = stretchResumeTarget(stretch);
  const resumeTitle = last?.track?.title ?? title.start.title;
  const kind: "continue" | "replay" = stretch.completed ? "replay" : "continue";

  const contextTitle = first?.track?.collectionTitle ?? null;

  return (
    <li className="px-[var(--space-lg)]">
      <div
        className={cn(
          "flex flex-wrap items-start gap-x-[var(--space-lg)] gap-y-[var(--space-sm)] py-[var(--space-md)]",
          // The hairline lives inside the card's padding, so it separates two
          // rows instead of tracing the card's own edge.
          divided && "border-t border-outline-variant",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[var(--space-sm)] gap-y-[var(--space-xxs)]">
            {/*
              Two lines, and the full run in `title`: a chapter title can be a
              sentence, and one row growing to five lines would push the time and
              the verdict off the screen it belongs on.
            */}
            <p
              className="type-body-strong line-clamp-2 min-w-0 text-text"
              title={describeStretchTitle(stretch)}
            >
              <TrackTitle part={title.start} />
              {title.end ? (
                <>
                  {/*
                    The arrow is isolated, not the title. `dir="ltr"` on the whole
                    title would lay the two Persian names out left-to-right and put
                    the *end* of the listen at the reading edge — the brief's rule
                    is about the arrow being punctuation, and isolating it is what
                    that rule is for.
                  */}
                  <span dir="ltr" aria-hidden className="mx-[var(--space-xs)] text-text-tertiary">
                    →
                  </span>
                  <TrackTitle part={title.end} />
                </>
              ) : null}
            </p>

            {verdict ? (
              <Badge tone={verdict.tone} size="sm">
                {verdict.label}
              </Badge>
            ) : null}

            {stretch.seeked ? (
              <Badge tone="muted" size="sm">
                پرش
              </Badge>
            ) : null}
          </div>

          <p className="type-caption mt-[var(--space-xxs)] text-text-tertiary">
            <span className="type-numeric">{formatStretchTimeRange(stretch)}</span>
            {tracks ? <span className="type-numeric"> · {tracks}</span> : null}
            {contextTitle ? (
              <>
                {" · "}
                <ContextLink stretch={stretch} title={contextTitle} />
              </>
            ) : (
              <PlaylistContext stretch={stretch} />
            )}
          </p>

          {positionRange || stretch.playbackSpeed !== 1 ? (
            <p className="type-caption mt-[var(--space-xxs)] text-text-tertiary">
              {positionRange ? <span className="type-numeric">{positionRange}</span> : null}
              {stretch.playbackSpeed !== 1 ? (
                <span className="type-numeric">
                  {positionRange ? " · " : null}
                  سرعت {formatSpeed(stretch.playbackSpeed)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="ms-auto flex shrink-0 items-center gap-[var(--space-md)]">
          <span className="type-numeric text-text-secondary">{formatSpan(stretch.listenedSec)}</span>

          <ResumeListenButton
            trackId={resume.trackId}
            positionSec={resume.positionSec}
            title={resumeTitle}
            kind={kind}
            playable={playable}
            live={live}
          />
        </div>
      </div>
    </li>
  );
}

/** One end of the title, linked when the track still exists. */
function TrackTitle({ part }: { part: { title: string; trackId: string | null } }) {
  if (part.trackId === null) {
    // «ترک حذف‌شده» — no link, because there is nowhere for it to go.
    return <span className="text-text-tertiary">{part.title}</span>;
  }
  return (
    <Link
      href={`/library/${part.trackId}`}
      className="rounded-[var(--radius-xs)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {part.title}
    </Link>
  );
}

/**
 * The collection an online stretch belonged to, linked to its page.
 *
 * Only when the key parses: a row written by a source this build does not know
 * would otherwise render a link to a 404. `parseCollectionKey` returns `null`
 * rather than throwing, which is exactly the check this needs.
 */
function ContextLink({ stretch, title }: { stretch: ListeningStretch; title: string }) {
  const parsed =
    stretch.contextType === "online" && stretch.contextKey
      ? parseCollectionKey(stretch.contextKey)
      : null;

  if (!parsed) {
    return <span>{title}</span>;
  }

  return (
    <Link
      href={`/browse/collection/${encodeURIComponent(parsed.sourceId)}/${encodeURIComponent(parsed.externalId)}`}
      className="rounded-[var(--radius-xs)] hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {title}
    </Link>
  );
}

/**
 * A playlist run, as a badge rather than a link.
 *
 * Playlists are Phase 3.3 and have no route yet. A link to a page that does not
 * exist is worse than a label that says what the run was.
 */
function PlaylistContext({ stretch }: { stretch: ListeningStretch }) {
  if (stretch.contextType !== "playlist") {
    return null;
  }
  return (
    <>
      {" · "}
      <Badge tone="muted" size="sm">
        پلی‌لیست
      </Badge>
    </>
  );
}
