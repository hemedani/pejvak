"use client";

/**
 * One playlist, editable.
 *
 * ## The props are the truth
 *
 * `entries` arrives resolved and ordered by the server page, and every write is
 * followed by `router.refresh()` — so there is no `useState` copy of the items
 * anywhere. A mirror would be a second source of truth for the one thing this
 * screen edits, and the first failed write would leave the two disagreeing with
 * no way to tell which was right.
 *
 * The index used by move and remove is the **entry index**, which is playback
 * order. It is never the stored `order` value: that is a data invariant, not a
 * number the listener should see or reason about.
 *
 * ## No optimistic reorder
 *
 * A playlist write replaces the whole `items[]`. An optimistic move that failed
 * would have to restore an array that may already be stale — reordering twice on
 * screen for one press — so the controls disable while a write is in flight and
 * the new order arrives from the server. Two concurrent whole-array writes are
 * the only way to corrupt order from the UI, and disabling is what prevents it.
 *
 * ## Writes are whole arrays
 *
 * Add, remove and move all compute the complete sequence and send it once. The
 * backend re-checks that every `trackId` belongs to the listener, so a picker
 * that offered a foreign track would fail the whole write; it only ever offers
 * this user's own library.
 *
 * ## Focus is part of the interaction
 *
 * A removed row takes its buttons with it, and the browser drops focus to
 * `<body>` — a screen reader then restarts at the top of the page. After a remove
 * focus moves to the row that took its place (or to "Add tracks" when the last
 * row went), and after a move it stays on the button that was pressed.
 */

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { deletePlaylist } from "@/app/actions/playlists/delete-playlist";
import { updatePlaylist } from "@/app/actions/playlists/update-playlist";
import { PlaylistPlayButton } from "@/components/domain/playlist-play-button";
import { PlaylistTrackPicker } from "@/components/domain/playlist-track-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/state";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import type { Playlist, PlaylistEntry } from "@/lib/domain/playlist";
import { PLAYLIST_TITLE_MAX } from "@/lib/domain/playlist-query";
import { isPlayableOnWeb, type TrackSummary } from "@/lib/domain/track";
import { formatCount, formatSpan } from "@/lib/format";
import { formatClock } from "@/lib/time";
import { failureMessage } from "@/lib/messages";
import { appendTracks, moveItem, playableEntries, removeTrack } from "@/lib/playlists";
import type { ActResult } from "@/lib/result";

type MoveAction = "up" | "down";

type FocusRequest =
  | { kind: "remove"; index: number }
  | { kind: "move"; trackId: string; action: MoveAction }
  /** The rename form closed; focus goes back to the button that opened it. */
  | { kind: "rename" };

export function PlaylistEditor({
  playlist,
  entries,
  library,
}: {
  playlist: Playlist;
  /** Already in playback order — the read built it from `orderedItems`. */
  entries: PlaylistEntry[];
  /** The whole library, for the picker. */
  library: TrackSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(playlist.title);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const confirmPanelRef = useRef<HTMLDivElement>(null);
  const actionRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusRequest = useRef<FocusRequest | null>(null);
  const restoreDeleteFocus = useRef(false);

  const confirmLabelId = useId();

  const playable = useMemo(() => playableEntries(entries), [entries]);
  const tracks = useMemo(() => playable.map((entry) => entry.track), [playable]);

  const presentIds = useMemo(
    () => new Set(entries.map((entry) => entry.item.trackId)),
    [entries],
  );

  /**
   * The sequence to send. Entries are already in playback order, so this is the
   * same sequence the list shows — `lib/playlists.ts` renumbers it and nothing
   * sorts it again.
   */
  const sequence = useMemo(() => entries.map((entry) => entry.item), [entries]);

  const playableDurationSec = playable.reduce((total, entry) => total + entry.track.durationSec, 0);
  // "On phone only" is about where the bytes are, so it counts local-origin rows
  // only — a track that left the library is not "on the phone", it is gone, and
  // its own row says so.
  const localCount = entries.filter(
    (entry) => entry.track !== null && !isPlayableOnWeb(entry.track),
  ).length;

  const meta = [
    formatCount(entries.length, "track"),
    playableDurationSec > 0 ? formatSpan(playableDurationSec) : null,
    localCount > 0 ? `${localCount} on phone only` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  // Focus after the list changes. Runs when `pending` settles, which is after
  // the refreshed props have been committed.
  useEffect(() => {
    if (pending) {
      return;
    }

    const request = focusRequest.current;
    if (!request) {
      return;
    }

    if (request.kind === "rename") {
      // The write failed and the form is still open: leave focus in the field
      // rather than moving it out from under the listener.
      if (renaming) {
        return;
      }
      focusRequest.current = null;
      renameButtonRef.current?.focus();
      return;
    }

    focusRequest.current = null;

    let key: string | null = null;
    if (request.kind === "remove") {
      const replacement = entries[request.index];
      key = replacement ? `${replacement.item.trackId}:remove` : null;
    } else {
      key = `${request.trackId}:${request.action}`;
    }

    const element = key === null ? undefined : actionRefs.current.get(key);
    // `isConnected` covers the row that no longer exists: a detached node cannot
    // take focus, and silently focusing nothing is how focus reaches `<body>`.
    const target = element?.isConnected ? element : addButtonRef.current;
    target?.focus();
  }, [pending, entries, renaming]);

  // The confirmation closes itself, so a pressed-by-accident state does not
  // linger while the listener reads the copy.
  useEffect(() => {
    if (!confirming) {
      return;
    }

    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      restoreDeleteFocus.current =
        active === null ||
        active === document.body ||
        confirmPanelRef.current?.contains(active) === true;
      setConfirming(false);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [confirming]);

  useEffect(() => {
    if (confirming || !restoreDeleteFocus.current) {
      return;
    }
    restoreDeleteFocus.current = false;
    deleteButtonRef.current?.focus();
  }, [confirming]);

  /**
   * One write, one failure banner, one refresh.
   *
   * Resolves `true` on success so a caller that owns local UI state (the picker's
   * selection) can clear it only when something actually changed.
   */
  function runWrite(
    write: () => Promise<ActResult<unknown>>,
    onSuccess?: () => void,
  ): Promise<boolean> {
    setError(null);

    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          const result = await write();

          if (!result.success) {
            setError(failureMessage(result.error));
            resolve(false);
            return;
          }

          if (onSuccess) {
            onSuccess();
          } else {
            router.refresh();
          }
          resolve(true);
        } catch {
          // A rejected action (an expired session redirects from inside
          // `callAct`) must still settle: a promise that never resolves would
          // leave the picker's button disabled for the rest of the visit.
          setError("That request did not go through. Try again.");
          resolve(false);
        }
      });
    });
  }

  function registerAction(trackId: string, action: MoveAction | "remove") {
    return (node: HTMLButtonElement | null) => {
      const key = `${trackId}:${action}`;
      if (node) {
        actionRefs.current.set(key, node);
      } else {
        actionRefs.current.delete(key);
      }
    };
  }

  function startRename() {
    setDraftTitle(playlist.title);
    setRenaming(true);
  }

  function cancelRename() {
    setRenaming(false);
    setDraftTitle(playlist.title);
  }

  function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();

    // A whitespace-only title is not a rename. The save button is already
    // disabled; this is the second line of defence.
    if (title.length === 0 || pending) {
      return;
    }

    // Saving an unchanged title is not a rename either — and a write would bump
    // `updatedAt`, moving the playlist to the top of the list for nothing.
    if (title === playlist.title) {
      cancelRename();
      return;
    }

    focusRequest.current = { kind: "rename" };

    void runWrite(
      () => updatePlaylist(playlist.id, { title }),
      () => {
        setRenaming(false);
        router.refresh();
      },
    );
  }

  function move(trackId: string, from: number, to: number, action: MoveAction) {
    if (pending || to < 0 || to >= entries.length) {
      return;
    }

    focusRequest.current = { kind: "move", trackId, action };
    void runWrite(() => updatePlaylist(playlist.id, { items: moveItem(sequence, from, to) }));
  }

  function remove(trackId: string, index: number) {
    if (pending) {
      return;
    }

    focusRequest.current = { kind: "remove", index };
    void runWrite(() =>
      updatePlaylist(playlist.id, { items: removeTrack(sequence, trackId) }),
    );
  }

  function addTracks(trackIds: string[]) {
    return runWrite(() =>
      updatePlaylist(playlist.id, { items: appendTracks(sequence, trackIds) }),
    );
  }

  function confirmDelete() {
    if (pending) {
      return;
    }

    void runWrite(
      () => deletePlaylist(playlist.id),
      () => {
        // `replace`, not `push`: the deleted playlist's URL is not a place to
        // come back to, and it would 404 on the way in.
        //
        // Do not follow it with `router.refresh()`. Two simultaneous RSC
        // requests corrupt the flight client's chunk state in Next 16.4
        // (`chunk.reason.enqueueModel is not a function`); the destination is
        // dynamic and is fetched fresh by this one navigation anyway.
        router.replace("/playlists");
      },
    );
  }

  function cancelDelete() {
    restoreDeleteFocus.current = true;
    setConfirming(false);
  }

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <header className="flex flex-col gap-[var(--space-md)]">
        <div>
          <p className="type-overline text-text-tertiary">Playlist</p>

          {renaming ? (
            <form
              onSubmit={submitRename}
              className="mt-[var(--space-xs)] flex flex-col gap-[var(--space-sm)] sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1">
                <TextField
                  label="Playlist name"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  maxLength={PLAYLIST_TITLE_MAX}
                  autoFocus
                  onKeyDown={(event) => {
                    // Escape cancels without writing. Blur does not save: a
                    // stray click would otherwise commit a half-typed name.
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                />
              </div>

              <div className="flex gap-[var(--space-sm)]">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={pending || draftTitle.trim().length === 0}
                >
                  Save
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={cancelRename} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <h1 className="type-title mt-[var(--space-xs)] text-text">{playlist.title}</h1>
          )}

          <p className="type-caption type-numeric mt-[var(--space-sm)] text-text-tertiary">{meta}</p>
        </div>

        <div className="flex flex-wrap items-center gap-[var(--space-sm)]">
          <PlaylistPlayButton playlist={playlist} tracks={tracks} />

          <Button
            ref={renameButtonRef}
            type="button"
            variant="secondary"
            size="md"
            onClick={startRename}
            disabled={pending || renaming}
          >
            Rename
          </Button>

          <Button
            ref={addButtonRef}
            type="button"
            variant="secondary"
            size="md"
            onClick={() => setPickerOpen((open) => !open)}
            disabled={pending}
            aria-expanded={pickerOpen}
          >
            {pickerOpen ? "Close" : "Add tracks"}
          </Button>
        </div>

        {entries.length > 0 && playable.length === 0 ? (
          <p className="type-caption text-text-tertiary">No track in this playlist can be played on the web.</p>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-[var(--space-sm)] rounded-[var(--radius-md)] bg-danger-soft px-[var(--space-md)] py-[var(--space-sm)] text-danger"
          >
            <Icon name="error" size="sm" className="mt-[2px] shrink-0" />
            <p className="type-caption">{error}</p>
          </div>
        ) : null}
      </header>

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon="playlist"
            title="This playlist is empty"
            description="Start with “Add tracks”."
          />
        </Card>
      ) : (
        <Card>
          <ol className="flex flex-col">
            {entries.map((entry, index) => (
              <PlaylistRow
                key={entry.item.trackId}
                entry={entry}
                index={index}
                last={index === entries.length - 1}
                pending={pending}
                registerAction={registerAction}
                onMove={move}
                onRemove={remove}
              />
            ))}
          </ol>
        </Card>
      )}

      {pickerOpen ? (
        <PlaylistTrackPicker
          library={library}
          presentIds={presentIds}
          pending={pending}
          onAdd={addTracks}
        />
      ) : null}

      <Card className="p-[var(--space-lg)]">
        <h2 className="type-heading text-text">Delete playlist</h2>
        <p className="type-caption mt-[var(--space-xs)] max-w-[62ch] text-text-tertiary">
          The playlist is deleted; its tracks, history and notes stay in your library.
        </p>

        <div className="mt-[var(--space-md)]">
          {confirming ? (
            <div
              ref={confirmPanelRef}
              role="alertdialog"
              aria-labelledby={confirmLabelId}
              className="rounded-[var(--radius-md)] border border-danger/40 bg-danger-soft p-[var(--space-md)]"
            >
              <p id={confirmLabelId} className="type-body-strong text-danger">
                Delete “{playlist.title}”?
              </p>

              <div className="mt-[var(--space-md)] flex flex-wrap gap-[var(--space-sm)]">
                <Button
                  type="button"
                  variant="danger"
                  size="md"
                  onClick={confirmDelete}
                  disabled={pending}
                  aria-busy={pending || undefined}
                >
                  Delete permanently
                </Button>
                <Button type="button" variant="ghost" size="md" onClick={cancelDelete} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              ref={deleteButtonRef}
              type="button"
              variant="danger"
              size="md"
              onClick={() => setConfirming(true)}
              disabled={pending}
            >
              Delete playlist
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * One row of the sequence.
 *
 * Not numbered: `order` is an invariant, not a display value, and the sequence
 * is already the position. A row that cannot be played is still a row — it can
 * be moved and removed like any other, and the badge says where its audio is.
 */
function PlaylistRow({
  entry,
  index,
  last,
  pending,
  registerAction,
  onMove,
  onRemove,
}: {
  entry: PlaylistEntry;
  index: number;
  last: boolean;
  pending: boolean;
  registerAction: (
    trackId: string,
    action: MoveAction | "remove",
  ) => (node: HTMLButtonElement | null) => void;
  onMove: (trackId: string, from: number, to: number, action: MoveAction) => void;
  onRemove: (trackId: string, index: number) => void;
}) {
  const { track } = entry;
  const trackId = entry.item.trackId;
  const title = track?.title ?? "This track is no longer in your library";
  const isLocal = track !== null && !isPlayableOnWeb(track);

  const meta =
    track === null
      ? null
      : [
          track.author,
          track.durationSec > 0 ? formatClock(track.durationSec) : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" · ");

  return (
    <li className="px-[var(--space-lg)]">
      <div
        className={cn(
          "flex items-start gap-[var(--space-md)] py-[var(--space-md)]",
          // Inset hairline: the border lives on the padded box, so it starts
          // where the artwork does instead of tracing the card's edge.
          !last && "border-b border-outline-variant",
        )}
      >
        <Artwork track={track} />

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "type-body-strong truncate",
              track === null ? "text-text-tertiary" : "text-text",
            )}
            title={title}
          >
            {title}
          </p>

          {meta ? (
            <p className="type-caption type-numeric mt-[var(--space-xxs)] text-text-tertiary">
              {meta}
            </p>
          ) : null}
        </div>

        {isLocal ? (
          <Badge tone="muted" size="sm" className="mt-[2px] shrink-0">
            Android app only
          </Badge>
        ) : null}

        <div className="flex shrink-0 items-center gap-[var(--space-xxs)]">
          <Button
            ref={registerAction(trackId, "up")}
            type="button"
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => onMove(trackId, index, index - 1, "up")}
            disabled={pending || index === 0}
            aria-label={`Move “${title}” up`}
            title={`Move “${title}” up`}
          >
            <Icon name="up" size="sm" />
          </Button>

          <Button
            ref={registerAction(trackId, "down")}
            type="button"
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => onMove(trackId, index, index + 1, "down")}
            disabled={pending || last}
            aria-label={`Move “${title}” down`}
            title={`Move “${title}” down`}
          >
            <Icon name="down" size="sm" />
          </Button>

          <Button
            ref={registerAction(trackId, "remove")}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(trackId, index)}
            disabled={pending}
            aria-label={`Remove “${title}” from the playlist`}
          >
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * The row's artwork, or a tile when there is none.
 *
 * A plain `<img>` with a fixed box, for the reason the library table uses one:
 * `next/image` needs every remote host allow-listed at build time, and a broken
 * image must not take the row down with it.
 */
function Artwork({ track }: { track: TrackSummary | null }) {
  if (track?.artworkUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={track.artworkUrl}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-[var(--radius-sm)] object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-sunken text-text-tertiary"
    >
      <Icon name="playlist" size="sm" />
    </span>
  );
}
