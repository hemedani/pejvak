"use client";

/**
 * One listen, opened.
 *
 * The History row says what was heard and for how long; this says *how much of
 * it, where, and when*. It is the web's answer to the phone's session sheet
 * (`mobile/src/components/session-detail/SessionDetailSheet.tsx`), and the
 * timeline is the point: everything else here is a fact a caption could carry,
 * while the bar is the one thing that answers the question the row raised and
 * could not answer.
 *
 * ## Why a trigger button rather than a clickable row
 *
 * The row already contains two links (each end of the title) and a resume button.
 * Wrapping it in a button would nest interactive elements, which is invalid HTML
 * and, worse, unreachable by keyboard in a predictable order. A named control at
 * the end of the row is honest about what it does and costs the row nothing.
 *
 * ## Why it does not fetch
 *
 * Everything drawn here is already on the page: the row's members, their
 * positions, their tracks. `playable` and `live` are computed by the row from the
 * same relation, so this component needs no catalogue import and the sheet cannot
 * disagree with the row that opened it.
 */

import { useMemo, useState } from "react";

import { ResumeListenButton } from "@/components/domain/resume-listen-button";
import { ListeningTimelineBar } from "@/components/domain/listening-timeline";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/player/sheet";
import { formatSpeed, formatSpan } from "@/lib/format";
import {
  describeStretchOutcome,
  describeStretchTracks,
  describeStretchTitle,
  formatStretchPositionRange,
  formatStretchTimeRange,
  stretchResumeTarget,
  type ListeningStretch,
  type StretchOutcome,
} from "@/lib/history";
import { timelineForStretch } from "@/lib/listeningTimeline";
import { paletteFor } from "@/lib/palette";
import { formatDateTime } from "@/lib/time";

/** The outcome, in the words the row's own badge uses for it. */
const OUTCOME_LABELS: Record<StretchOutcome, string> = {
  complete: "Complete — heard through",
  finished: "Finished",
  interrupted: "Interrupted",
  open: "In progress",
};

type Fact = { label: string; value: string };

export function SessionDetailButton({
  stretch,
  playable,
  live,
}: {
  stretch: ListeningStretch;
  /** Whether the web can play this track at all, from the row's own relation. */
  playable: boolean;
  /** A live source, which has no position to return to. */
  live: boolean;
}) {
  const [open, setOpen] = useState(false);

  const title = describeStretchTitle(stretch);
  const resume = stretchResumeTarget(stretch);
  const timeline = useMemo(() => timelineForStretch(stretch), [stretch]);
  const tint = paletteFor(stretch.startContentHash)[1];

  const positionRange = formatStretchPositionRange(stretch);
  const tracks = describeStretchTracks(stretch);
  const collection = stretch.members[0]?.track?.collectionTitle ?? null;

  const facts: Fact[] = [
    { label: "Date", value: formatDateTime(stretch.startedAt) },
    stretch.trackCount > 1
      ? { label: "Tracks", value: tracks ?? `${stretch.trackCount}` }
      : { label: "Heard", value: positionRange ?? "—" },
    { label: "Listened", value: formatSpan(stretch.listenedSec) },
    { label: "Speed", value: formatSpeed(stretch.playbackSpeed) },
    { label: "Outcome", value: OUTCOME_LABELS[describeStretchOutcome(stretch)] },
    ...(collection ? [{ label: "Collection", value: collection }] : []),
  ];

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        onClick={() => setOpen(true)}
        aria-label={`Timeline for ${title}`}
        title="Timeline"
      >
        <Icon name="timeline" size="sm" />
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={formatStretchTimeRange(stretch)}
        footer={
          <div className="flex justify-end">
            <ResumeListenButton
              trackId={resume.trackId}
              positionSec={resume.positionSec}
              title={title}
              kind={stretch.completed ? "replay" : "continue"}
              playable={playable}
              live={live}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-[var(--space-xl)]">
          <ListeningTimelineBar timeline={timeline} tint={tint} />

          {/*
            A definition list, not a table: these are pairs, and a table would
            claim a relationship between the rows that they do not have.
          */}
          <dl className="flex flex-col">
            {facts.map((fact, index) => (
              <div
                key={fact.label}
                className={
                  index === 0
                    ? "flex items-baseline justify-between gap-[var(--space-lg)] py-[var(--space-sm)]"
                    : "flex items-baseline justify-between gap-[var(--space-lg)] border-t border-outline-variant py-[var(--space-sm)]"
                }
              >
                <dt className="type-caption shrink-0 text-text-secondary">{fact.label}</dt>
                <dd className="type-label min-w-0 truncate text-end text-text">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Sheet>
    </>
  );
}
