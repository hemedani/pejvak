"use client";

/**
 * One listen, opened in place.
 *
 * The History row says what was heard and for how long; this says *how much of
 * it, where, and when*. It is the web's answer to the phone's session sheet
 * (`mobile/src/components/session-detail/SessionDetailSheet.tsx`), and the
 * timeline is the point: everything else here is a fact a caption could carry,
 * while the bar is the one thing that answers the question the row raised and
 * could not answer.
 *
 * ## It expands the row, and used to cover the page
 *
 * This was a modal. A dialog is the right shape for a decision — a confirmation,
 * a queue being edited — and the wrong one for *detail about the row you are
 * already looking at*. Opening one row in a sheet hid the rows around it, dimmed
 * the page, trapped focus, and put the timeline in a 30rem column, all to show
 * one strip and five facts. The panel grows out of its own row instead: the list
 * stays visible, nothing is trapped, the strip gets the card's full width, and
 * closing costs no more than another click.
 *
 * The consequence worth stating: **focus never moves**. A disclosure keeps the
 * trigger focused and lets the reader leave whenever they like, which is exactly
 * the behaviour a dialog must prevent.
 *
 * ## Three parts, one piece of state
 *
 * `SessionDisclosure` owns the open flag; the trigger and the panel read it from
 * context. They sit in different places in the row — the trigger in the action
 * cluster, the panel after the row — so a prop would have to be threaded from
 * `HistoryRow`, and that would make the whole row a client component. Context
 * keeps the row's markup on the server and hydrates only these three pieces.
 *
 * ## Why the trigger is a named control
 *
 * The row already contains two links and a button. Wrapping it in a button would
 * nest interactive elements, which is invalid HTML and unreachable by keyboard in
 * a predictable order. A named control at the end of the row is honest about what
 * it does and costs the row nothing.
 *
 * ## Why it does not fetch
 *
 * Everything drawn here is already on the page: the row's members, their
 * positions, their tracks. `playable` and `live` are computed by the row from the
 * same relation, so this component needs no catalogue import and the panel cannot
 * disagree with the row that opened it.
 */

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";

import { ListeningTimelineBar } from "@/components/domain/listening-timeline";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { formatSpeed, formatSpan } from "@/lib/format";
import {
  describeStretchOutcome,
  describeStretchTracks,
  formatStretchPositionRange,
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

type Disclosure = { open: boolean; toggle: () => void; panelId: string };

const DisclosureContext = createContext<Disclosure | null>(null);

/**
 * The row's open flag.
 *
 * Wraps the row's markup rather than the row itself, so `HistoryRow` stays a
 * Server Component and only this provider plus its two readers ship to the
 * browser.
 */
export function SessionDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <DisclosureContext.Provider
      value={{ open, toggle: () => setOpen((current) => !current), panelId }}
    >
      {children}
    </DisclosureContext.Provider>
  );
}

function useDisclosure(): Disclosure {
  const value = useContext(DisclosureContext);
  if (value === null) {
    throw new Error("SessionDetail parts must be rendered inside <SessionDisclosure>.");
  }
  return value;
}

/**
 * The way in.
 *
 * The visible word is `Timeline` and the accessible name starts with it — a
 * label that replaces visible text rather than extending it is how a button
 * starts answering to a name nobody on screen can see (WCAG 2.5.3). The row is
 * named too, because eight "Timeline" buttons in a list are indistinguishable to
 * someone listening to the screen.
 */
export function SessionDetailTrigger({ title }: { title: string }) {
  const { open, toggle, panelId } = useDisclosure();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`Timeline for ${title}`}
      title="Timeline"
    >
      <Icon name="timeline" size="sm" />
      Timeline
      <Icon
        name="down"
        size="xs"
        className={cn(
          "transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)]",
          open && "rotate-180",
        )}
      />
    </Button>
  );
}

/**
 * What the row opens into.
 *
 * Rendered even when closed, because a panel that is unmounted cannot animate
 * out. `inert` is what keeps the collapsed copy out of the tab order and the
 * accessibility tree while it sits at zero height.
 */
export function SessionDetailPanel({ stretch }: { stretch: ListeningStretch }) {
  const { open, panelId } = useDisclosure();

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
    <div
      id={panelId}
      className="disclosure"
      data-open={open ? "true" : "false"}
      inert={!open}
    >
      <div className="disclosure-clip">
        <div className="disclosure-body">
          <div className="border-t border-outline-variant pb-[var(--space-lg)] pt-[var(--space-md)]">
            <div className="flex flex-col gap-[var(--space-lg)]">
              <ListeningTimelineBar timeline={timeline} tint={tint} />

              {/*
                A definition list, not a table: these are pairs, and a table would
                claim a relationship between the rows that they do not have. It is
                a band rather than a stack because the panel now has the card's
                width — the sheet this replaced had 30rem and had to scroll.
              */}
              <dl className="grid grid-cols-2 gap-x-[var(--space-xl)] gap-y-[var(--space-md)] sm:grid-cols-3 lg:grid-cols-6">
                {facts.map((fact) => (
                  <div key={fact.label} className="min-w-0">
                    <dt className="type-caption text-text-tertiary">{fact.label}</dt>
                    {/*
                      `dir="auto"` goes on an *inline* span, and the truncation
                      stays on the cell. A block-level `dir="auto"` makes the
                      block itself RTL for a Persian value, so `start` resolves to
                      the right and the value stops sharing an edge with the label
                      above it. Inline, the direction orders the characters and
                      nothing else: the line still starts where the cell does.
                    */}
                    <dd className="type-label mt-[var(--space-xxs)] truncate text-text" title={fact.value}>
                      <span dir="auto">{fact.value}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
