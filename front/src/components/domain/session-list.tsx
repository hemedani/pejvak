/**
 * One track's listening history, as a timeline.
 *
 * ## Why not a table
 *
 * A table of sessions on a *track* page is a table with one subject repeated in
 * every row. What the listener is actually reading is a sequence — when, how
 * long, from where to where — so it is rendered as one: a rail with a dot per
 * session, oldest at the bottom because the act returns newest first.
 *
 * ## The verdict is the phone's, not ours
 *
 * `completed` and `interrupted` are written by the mobile app during sync
 * (`models/playbackSession.ts`), and `seeked` is stored rather than derived for
 * a reason the model states: a scrub leaves a perfectly plausible position
 * behind, so "heard it through" cannot be reconstructed from timestamps. This
 * component therefore *reports* the verdict and never computes one. Deriving
 * "did they finish it" from `endPositionSec >= durationSec` would disagree with
 * the phone the first time somebody scrubbed to the end.
 */

import { Badge } from "@/components/ui/badge";
import type { SessionDetail } from "@/lib/domain/session";
import { formatCount, formatSpeed, formatSpan } from "@/lib/format";
import { formatClock, formatDateTime } from "@/lib/time";

export function SessionList({ sessions }: { sessions: readonly SessionDetail[] }) {
  return (
    <ol className="flex flex-col">
      {sessions.map((session, index) => (
        <SessionRow
          key={session.id}
          session={session}
          /** The rail stops at the last dot instead of running past it. */
          last={index === sessions.length - 1}
        />
      ))}
    </ol>
  );
}

function SessionRow({ session, last }: { session: SessionDetail; last: boolean }) {
  // Only meaningful when the listen actually moved. A session that recorded
  // `0 → 0` (a row synced before the phone tracked positions) would otherwise
  // read "from 0:00 to 0:00" beside every entry.
  const moved = session.endPositionSec > session.startPositionSec;

  return (
    <li className="flex gap-[var(--space-md)]">
      <div aria-hidden className="relative flex w-2 shrink-0 justify-center">
        {last ? null : <span className="absolute inset-y-0 w-px bg-outline-variant" />}
        <span className="relative mt-[7px] size-2 rounded-full bg-accent" />
      </div>

      <div className={last ? "min-w-0 flex-1 pb-0" : "min-w-0 flex-1 pb-[var(--space-lg)]"}>
        <div className="flex flex-wrap items-center gap-x-[var(--space-sm)] gap-y-[var(--space-xxs)]">
          <p className="type-label text-text">{formatDateTime(session.startedAt)}</p>
          <Verdict session={session} />
          {session.seeked ? (
            <Badge tone="muted" size="sm">
              Seek
            </Badge>
          ) : null}
        </div>

        <p className="type-caption mt-[var(--space-xxs)] text-text-tertiary">
          <span className="type-numeric">{formatSpan(session.durationListenedSec)}</span>
          {moved ? (
            <>
              {" · from "}
              <span className="type-numeric">{formatClock(session.startPositionSec)}</span>
              {" to "}
              <span className="type-numeric">{formatClock(session.endPositionSec)}</span>
            </>
          ) : null}
          {session.playbackSpeed === 1 ? null : (
            <>
              {" · speed "}
              <span className="type-numeric">{formatSpeed(session.playbackSpeed)}</span>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

/**
 * The three outcomes the backend can report.
 *
 * `interrupted` is checked before the fallback because it is the more specific
 * fact: a listen that stopped *because* the app was killed is different from one
 * that stopped because the listener put the phone down, and the second is not a
 * fault.
 */
function Verdict({ session }: { session: SessionDetail }) {
  if (session.completed) {
    return (
      <Badge tone="accent" size="sm">
        Finished
      </Badge>
    );
  }

  if (session.interrupted) {
    return (
      <Badge tone="danger" size="sm">
        Interrupted
      </Badge>
    );
  }

  return (
    <Badge tone="neutral" size="sm">
      Unfinished
    </Badge>
  );
}

/**
 * A one-line summary of the page of sessions shown.
 *
 * Deliberately says "of these" rather than a total: the act returns a page and
 * no count, so any total here would be the number of rows that happened to
 * arrive (see `actions/sessions/get-track-sessions.ts`). A count derived from a
 * page and presented as a total is the one lie a timeline cannot afford.
 */
export function SessionListSummary({
  sessions,
  page,
}: {
  sessions: readonly SessionDetail[];
  page: number;
}) {
  const listenedSec = sessions.reduce((total, session) => total + session.durationListenedSec, 0);

  return (
    <p className="type-caption text-text-tertiary">
      {formatCount(sessions.length, "session")} on this page ·{" "}
      <span className="type-numeric">{formatSpan(listenedSec)}</span>
      {page > 1 ? ` · page ${page}` : ""}
    </p>
  );
}
