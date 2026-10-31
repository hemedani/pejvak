"use client";

/**
 * A track's notes, both halves.
 *
 * The server half comes from `getTrackDetail`'s embedded relation (the only
 * route to one track's notes). The local half is the write-ahead queue, so a
 * note appears the instant it is written. They are merged by `clientId` and
 * server id; neither list is trusted to contain the other's additions.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { deleteNote } from "@/app/actions/player/delete-note";
import { getTrackNotes } from "@/app/actions/player/get-track-notes";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { Annotation } from "@/lib/domain/annotation";
import { formatClockFa } from "@/lib/format";
import {
  deletedNoteClientIds,
  deletePlayerNote,
  ensureNoteQueued,
  localNotesFor,
  type PlayerNote,
} from "@/lib/player/notes";
import { subscribeSync } from "@/lib/player/sync";
import { OPEN_NOTE_EVENT } from "./queue-events";
import { usePlayerStore } from "@/stores/player";

import { AnnotationComposer, type ComposerInitial } from "./annotation-composer";
import { Sheet } from "./sheet";
import type { TimelineMarker } from "./annotation-markers";

type DisplayNote = {
  key: string;
  clientId: string | null;
  serverId: string | null;
  positionSec: number;
  text: string;
  tags: string[];
  color: string | null;
  pending: boolean;
};

function fromLocal(note: PlayerNote): DisplayNote {
  return {
    key: `local:${note.clientId}`,
    clientId: note.clientId,
    serverId: note.serverId,
    positionSec: note.positionSec,
    text: note.text,
    tags: note.tags,
    color: note.color ?? null,
    pending: note.pending,
  };
}

function fromServer(note: Annotation): DisplayNote {
  return {
    key: `server:${note.id}`,
    clientId: note.clientId,
    serverId: note.id,
    positionSec: note.positionSec,
    text: note.text,
    tags: note.tags,
    color: note.color,
    pending: false,
  };
}

export function AnnotationList({
  contentHash,
  serverId,
  durationSec,
  onSeek,
  onMarkersChange,
  selectedKey = null,
  onNoteDeleted,
}: {
  contentHash: string;
  serverId: string | null;
  durationSec: number;
  onSeek: (positionSec: number) => void;
  onMarkersChange?: (markers: TimelineMarker[]) => void;
  selectedKey?: string | null;
  onNoteDeleted?: (key: string) => void;
}) {
  const [serverState, setServerState] = useState<{ key: string; notes: Annotation[] }>({
    key: "",
    notes: [],
  });
  const [revision, setRevision] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<ComposerInitial | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DisplayNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seedPositionSec = usePlayerStore((state) => state.positionSec);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    if (!serverId) {
      return () => {
        alive = false;
      };
    }

    void getTrackNotes(serverId).then((result) => {
      if (alive && result.success) {
        setServerState({ key: serverId, notes: result.body });
      }
    });

    return () => {
      alive = false;
    };
  }, [serverId, contentHash, revision]);

  const serverNotes = useMemo(
    () => (serverState.key === (serverId ?? "") ? serverState.notes : []),
    [serverState, serverId],
  );

  useEffect(() => {
    let wasSyncing = false;
    return subscribeSync((state) => {
      if (wasSyncing && !state.syncing) {
        refresh();
      }
      wasSyncing = state.syncing;
    });
  }, [refresh]);

  const locals = useMemo(
    () => localNotesFor(contentHash),
    // `revision` is the refresh signal; the storage read is not reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentHash, revision],
  );

  const notes = useMemo(() => {
    const deleted = deletedNoteClientIds(contentHash);
    const localClientIds = new Set(locals.map((note) => note.clientId));
    const localServerIds = new Set(
      locals.map((note) => note.serverId).filter((id): id is string => id !== null),
    );

    const remote = serverNotes
      .filter((note) => {
        if (note.clientId !== null && deleted.has(note.clientId)) {
          return false;
        }
        if (note.clientId !== null && localClientIds.has(note.clientId)) {
          return false;
        }
        return !localServerIds.has(note.id);
      })
      .map(fromServer);

    return [...locals.map(fromLocal), ...remote].sort(
      (a, b) => a.positionSec - b.positionSec,
    );
  }, [serverNotes, locals, contentHash]);

  useEffect(() => {
    if (!onMarkersChange) {
      return;
    }
    onMarkersChange(
      notes.map((note) => ({
        id: note.key,
        positionSec: note.positionSec,
        text: note.text,
        color: note.color ?? "var(--outline-strong)",
      })),
    );
  }, [notes, onMarkersChange]);

  const openNew = useCallback(() => {
    setEditing(null);
    setComposerOpen(true);
  }, []);

  useEffect(() => {
    const open = () => openNew();
    window.addEventListener(OPEN_NOTE_EVENT, open);
    return () => window.removeEventListener(OPEN_NOTE_EVENT, open);
  }, [openNew]);

  const openEdit = (note: DisplayNote) => {
    setEditing({
      clientId: note.clientId,
      serverId: note.serverId,
      positionSec: note.positionSec,
      text: note.text,
      tags: note.tags,
      color: note.color,
      pending: note.pending,
    });
    setComposerOpen(true);
  };

  const performDelete = async (note: DisplayNote) => {
    setError(null);
    if (note.clientId !== null) {
      ensureNoteQueued({
        clientId: note.clientId,
        serverId: note.serverId,
        contentHash,
        positionSec: note.positionSec,
        text: note.text,
        tags: note.tags,
        color: note.color,
      });
      await deletePlayerNote({
        clientId: note.clientId,
        contentHash,
        positionSec: note.positionSec,
      });
      refresh();
      onNoteDeleted?.(note.key);
      return;
    }

    if (note.serverId === null) {
      return;
    }

    const result = await deleteNote(note.serverId);
    if (!result.success) {
      setError("حذف در سرور انجام نشد؛ دوباره تلاش کنید.");
      return;
    }
    refresh();
    onNoteDeleted?.(note.key);
  };

  return (
    <section aria-labelledby="notes-heading" className="flex flex-col gap-[var(--space-md)]">
      <div className="flex items-center justify-between gap-[var(--space-md)]">
        <h2 id="notes-heading" className="type-heading text-text">
          یادداشت‌ها
        </h2>
        <Button variant="secondary" size="sm" onClick={openNew}>
          <Icon name="plus" size="sm" />
          یادداشت در این لحظه
        </Button>
      </div>

      {error ? (
        <p className="type-caption text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {notes.length === 0 ? (
        <p className="type-body rounded-[var(--radius-md)] bg-surface-sunken px-[var(--space-lg)] py-[var(--space-xl)] text-center text-text-secondary">
          هنوز یادداشتی برای این قطعه نیست.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant rounded-[var(--radius-lg)] border border-outline-variant bg-surface">
          {notes.map((note) => (
            <li
              key={note.key}
              id={`note-${note.key}`}
              className={cn(
                "flex items-start gap-[var(--space-md)] px-[var(--space-lg)] py-[var(--space-md)]",
                selectedKey === note.key && "bg-accent-soft",
              )}
            >
              <button
                type="button"
                className="type-numeric shrink-0 rounded-[var(--radius-xs)] px-[var(--space-xs)] py-[var(--space-xxs)] text-accent hover:bg-accent-soft"
                aria-label={`پرش به ${formatClockFa(note.positionSec)}`}
                onClick={() => onSeek(note.positionSec)}
              >
                {formatClockFa(note.positionSec)}
              </button>

              <div className="min-w-0 flex-1">
                <p className={cn("type-body text-text", note.text === "" && "text-text-tertiary")}>
                  {note.text === "" ? "نشانهٔ بی‌متن" : note.text}
                </p>
                {note.tags.length > 0 ? (
                  <p className="type-caption mt-[var(--space-xxs)] text-text-tertiary">
                    {note.tags.map((tag) => `#${tag}`).join("  ")}
                  </p>
                ) : null}
                {note.pending ? (
                  <p className="type-caption mt-[var(--space-xxs)] text-text-tertiary">
                    در صف همگام‌سازی
                  </p>
                ) : null}
              </div>

              <span
                aria-hidden
                className="mt-1 size-3 shrink-0 rounded-full border-2 border-surface"
                style={{ backgroundColor: note.color ?? "var(--outline-strong)" }}
              />

              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-text-tertiary hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  aria-label="ویرایش یادداشت"
                  onClick={() => openEdit(note)}
                >
                  <Icon name="note" size="sm" />
                </button>
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-[var(--radius-xs)] text-text-tertiary hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  aria-label="حذف یادداشت"
                  onClick={() => setPendingDelete(note)}
                >
                  <Icon name="delete" size="sm" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title="حذف یادداشت؟"
        description="این یادداشت حذف و همگام‌سازی می‌شود."
        footer={
          <div className="flex justify-end gap-[var(--space-sm)]">
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              انصراف
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const note = pendingDelete;
                setPendingDelete(null);
                if (note) {
                  void performDelete(note);
                }
              }}
            >
              حذف
            </Button>
          </div>
        }
      >
        <p className="type-body text-text">
          {pendingDelete?.text === "" ? "نشانهٔ بی‌متن" : pendingDelete?.text}
        </p>
        <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
          {pendingDelete ? formatClockFa(pendingDelete.positionSec) : ""}
        </p>
      </Sheet>

      <AnnotationComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        contentHash={contentHash}
        durationSec={durationSec}
        seedPositionSec={seedPositionSec}
        initial={editing}
        onSaved={refresh}
      />
    </section>
  );
}
