"use client";

/**
 * Reopening the track a stretch stopped on.
 *
 * The only client state on the History page. Three rules it exists to keep:
 *
 *   · **A local track is a fact, not a failure.** Its bytes live on the phone
 *     and the server never saw them, so the control is disabled from the first
 *     paint with the reason under it. The row already knows this — the embedded
 *     relation carries `origin` — so nothing is fetched to discover it.
 *   · **One track, not a rebuilt collection.** Resuming a run through a
 *     collection from here would invent a new run with a different `trackCount`,
 *     and the collection's contents may have changed since. History resumes the
 *     file that was playing.
 *   · **A live stream cannot be resumed.** A stored position belongs to a
 *     broadcast that has moved on, so a live source starts at 0 and says so.
 *
 * The click fetches the track because the queue entry needs the full row
 * (`contentHash`, ids, artwork) and the relation on a history row is a
 * projection. One small read per resume, and the player owns everything after.
 */

import { useRef, useState } from "react";

import { getTrackDetail } from "@/app/actions/tracks/get-track-detail";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { isPlayableOnWeb } from "@/lib/domain/track";
import { formatClockFa } from "@/lib/format";
import { failureMessage } from "@/lib/messages";
import { playQueueAt } from "@/lib/player/controller";
import { playerTrackFromTrack } from "@/lib/player/from-track";
import { isLiveSource } from "@/lib/player/stream";

export function ResumeListenButton({
  trackId,
  positionSec,
  kind,
  playable,
  live,
  title,
}: {
  trackId: string | null;
  positionSec: number;
  title: string;
  /** Copy only — both seek to `positionSec`. */
  kind: "continue" | "replay";
  /** Whether the web can play this track at all, from the row's own relation. */
  playable: boolean;
  /** A live source, which has no position to return to. */
  live: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not the state above: two clicks in one tick both read `false` from a
  // state that has not re-rendered yet.
  const busy = useRef(false);

  if (trackId === null) {
    return null;
  }

  const startAt = live ? 0 : Math.max(0, Math.round(positionSec));
  const label = live ? "پخش زنده" : kind === "continue" ? "ادامه" : "پخش دوباره";
  // The position is part of the accessible name, not a tooltip: "ادامه" alone
  // does not say where, and a screen reader has no title attribute to read.
  const position = live ? label : `${label} از ${formatClockFa(startAt)}`;
  // The track is named as well: a list of eight «ادامه از ۲:۰۵» rows is
  // indistinguishable to someone listening to the screen.
  const accessible = `${position}، ${title}`;

  if (!playable) {
    return (
      <div className="flex flex-col items-end gap-[var(--space-xxs)]">
        <Button type="button" variant="ghost" size="sm" disabled>
          <Icon name="play" size="sm" />
          {label}
        </Button>
        <span className="type-caption text-text-tertiary">صدا روی گوشی است</span>
      </div>
    );
  }

  async function start() {
    if (busy.current || trackId === null) {
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);

    try {
      const result = await getTrackDetail(trackId);

      if (!result.success) {
        setError(failureMessage(result.error));
        return;
      }
      if (result.body === null) {
        setError("این ترک پیدا نشد.");
        return;
      }

      const track = result.body;
      if (!isPlayableOnWeb(track)) {
        setError("صدا روی گوشی است.");
        return;
      }

      const queue = [playerTrackFromTrack(track)];
      // The action is the authority on live, not the row: a source can be
      // registered as live after the page was rendered.
      const position = isLiveSource(track.sourceId) ? 0 : startAt;
      await playQueueAt(queue, 0, { startPositionSec: position });
    } catch {
      setError("پخش آغاز نشد. دوباره تلاش کنید.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-[var(--space-xxs)]">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void start()}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={accessible}
        title={accessible}
      >
        {pending ? (
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          <Icon name="play" size="sm" />
        )}
        {label}
      </Button>

      {error ? (
        <p className="type-caption text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
