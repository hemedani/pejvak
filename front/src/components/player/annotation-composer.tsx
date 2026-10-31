"use client";

/**
 * Writing a note.
 *
 * The writer sees the note before they save it: a local queue row is created
 * immediately and the sync engine carries it to the server. Position is
 * editable only before the first sync — `updateAnnotation` accepts text, tags
 * and colour, so offering a movable timecode on a synced note would be offering
 * something that quietly does not move.
 *
 * Colour is picked from the six mobile swatches, shown with a ring *and* a
 * check: the palette is not the only way to know which one is selected.
 *
 * The form is a keyed child so reopening a different note mounts fresh state.
 * That is why there is no "reset on open" effect: a form that resets itself
 * after paint can flash the previous note's text for one frame.
 */

import { useId, useState } from "react";

import { updateNote } from "@/app/actions/player/update-note";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import {
  ANNOTATION_COLORS,
  ANNOTATION_COLOR_NAMES,
  normalizeAnnotationColor,
  pickAnnotationColor,
} from "@/lib/player/annotations";
import { createNote, editNote, ensureNoteQueued } from "@/lib/player/notes";
import { foldText } from "@/lib/search";
import { formatClockFa } from "@/lib/format";
import { clampSeconds, digitsToSeconds, formatClock } from "@/lib/time";

import { Sheet } from "./sheet";

export type ComposerInitial = {
  clientId: string | null;
  serverId: string | null;
  positionSec: number;
  text: string;
  tags: string[];
  color: string | null;
  pending: boolean;
};

export function AnnotationComposer({
  open,
  onOpenChange,
  contentHash,
  durationSec,
  seedPositionSec,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentHash: string;
  durationSec: number;
  seedPositionSec: number;
  initial: ComposerInitial | null;
  onSaved: () => void;
}) {
  const key = `${initial?.clientId ?? "new"}:${initial?.serverId ?? ""}:${contentHash}`;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        initial
          ? "ویرایش یادداشت"
          : `یادداشت در ${formatClockFa(seedPositionSec)}`
      }
      description={
        initial === null || initial.pending
          ? "جای یادداشت را می‌توانید تا پیش از همگام‌سازی تغییر دهید."
          : "جای این یادداشت پس از همگام‌سازی ثابت است."
      }
    >
      <ComposerBody
        key={key}
        contentHash={contentHash}
        durationSec={durationSec}
        seedPositionSec={seedPositionSec}
        initial={initial}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />
    </Sheet>
  );
}

function ComposerBody({
  contentHash,
  durationSec,
  seedPositionSec,
  initial,
  onOpenChange,
  onSaved,
}: {
  contentHash: string;
  durationSec: number;
  seedPositionSec: number;
  initial: ComposerInitial | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join("، "));
  const [position, setPosition] = useState(
    formatClock(initial?.positionSec ?? Math.max(0, Math.round(seedPositionSec))),
  );
  const [color, setColor] = useState(() =>
    normalizeAnnotationColor(
      initial?.color ?? pickAnnotationColor(initial?.positionSec ?? seedPositionSec),
      initial?.positionSec ?? seedPositionSec,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const textId = useId();

  const positionEditable = initial === null || initial.pending;

  const save = async () => {
    // Fold before de-duplicating, so «کتاب» and «كتاب» are one tag; the first
    // spelling the listener typed is the one that is kept.
    const seenTags = new Set<string>();
    const parsedTags: string[] = [];
    for (const tag of tags.split(/[,،]/)) {
      const trimmed = tag.trim();
      const key = foldText(trimmed);
      if (trimmed.length === 0 || seenTags.has(key)) {
        continue;
      }
      seenTags.add(key);
      parsedTags.push(trimmed);
    }
    const positionSec = positionEditable
      ? clampSeconds(digitsToSeconds(position), durationSec > 0 ? durationSec : undefined)
      : (initial?.positionSec ?? 0);

    if (positionEditable && digitsToSeconds(position) <= 0 && !/[0۰]/.test(position)) {
      setError("یک زمان برای یادداشت وارد کنید.");
      return;
    }
    if (text.trim() === "") {
      setError("متن یادداشت نمی‌تواند خالی باشد.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (initial === null) {
        createNote({ contentHash, positionSec, text, tags: parsedTags, color });
      } else if (initial.clientId === null) {
        if (initial.serverId === null) {
          throw new Error("no id");
        }
        const result = await updateNote({
          annotationId: initial.serverId,
          text: text.trim(),
          tags: parsedTags,
          color,
          updatedAt: Date.now(),
        });
        if (!result.success) {
          throw new Error("server");
        }
      } else {
        ensureNoteQueued({
          clientId: initial.clientId,
          serverId: initial.serverId,
          contentHash,
          positionSec: initial.positionSec,
          text: initial.text,
          tags: initial.tags,
          color: initial.color,
        });
        await editNote({
          clientId: initial.clientId,
          contentHash,
          positionSec,
          text,
          tags: parsedTags,
          color,
        });
      }
      onSaved();
      onOpenChange(false);
    } catch {
      setError("ذخیره نشد. یادداشت در صف می‌ماند و دوباره تلاش می‌شود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      {error ? (
        <p className="type-caption text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {positionEditable ? (
        <TextField
          label="زمان"
          hint="مثلاً ۱۲:۳۴"
          inputMode="numeric"
          value={position}
          onChange={(event) => setPosition(event.target.value)}
        />
      ) : (
        <p className="type-label text-text-secondary">
          جای یادداشت: <span className="type-numeric text-text">{formatClock(initial?.positionSec ?? 0)}</span>
        </p>
      )}

      <div className="flex flex-col gap-[var(--space-sm)]">
        <label htmlFor={textId} className="type-label text-text">
          متن یادداشت
        </label>
        <textarea
          id={textId}
          value={text}
          rows={4}
          onChange={(event) => setText(event.target.value)}
          className="w-full resize-y rounded-[var(--radius-md)] border border-outline-strong bg-surface-sunken px-[var(--space-lg)] py-[var(--space-md)] type-body text-text placeholder:text-text-tertiary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          placeholder="چیزی که می‌خواهید به یاد بسپارید…"
          autoFocus
        />
      </div>

      <TextField
        label="برچسب‌ها"
        hint="با ویرگول جدا کنید؛ مثلاً ایده، بازبینی"
        value={tags}
        onChange={(event) => setTags(event.target.value)}
      />

      <fieldset className="flex flex-col gap-[var(--space-sm)]">
        <legend className="type-label text-text">رنگ نشانگر</legend>
        <div className="flex flex-wrap gap-[var(--space-sm)]">
          {ANNOTATION_COLORS.map((swatch) => {
            const active = swatch === color;
            return (
              <button
                key={swatch}
                type="button"
                className={cn(
                  "grid size-9 place-items-center rounded-full border-2 border-surface shadow-[var(--elevation-card)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                  active && "ring-2 ring-text ring-offset-2 ring-offset-[var(--glass)]",
                )}
                style={{ backgroundColor: swatch }}
                aria-label={ANNOTATION_COLOR_NAMES[swatch] ?? "رنگ"}
                aria-pressed={active}
                onClick={() => setColor(swatch)}
              >
                {active ? <Icon name="check" size="sm" className="text-white" /> : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex justify-end gap-[var(--space-sm)] border-t border-[var(--glass-border)] pt-[var(--space-md)]">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          انصراف
        </Button>
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={busy || text.trim() === ""}
        >
          {busy ? "در حال ذخیره…" : "ذخیره"}
        </Button>
      </div>
    </div>
  );
}
