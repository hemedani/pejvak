"use client";

/**
 * Picking tracks to append, inside a card on the detail page.
 *
 * No modal and no route: the library is already on the page (one read, shared
 * with the join), so the picker is a filtered view of an array that is in memory.
 *
 * ## Membership comes from props, not from state
 *
 * `candidates` is `library` minus `presentIds`, recomputed every render from the
 * server's data. Caching "what is already in the playlist" in a `useState` would
 * be a second source of truth, and the first add would leave the row on screen
 * until a reload — which is exactly the bug a `useEffect` would then be written
 * to paper over.
 *
 * ## The search is the library's search
 *
 * `createSearchIndex` folds every field once per data change, and `searchIndex`
 * ranks the hits. An `includes()` over raw text would miss `كتاب` for `کتاب` —
 * the Arabic and Persian kaf are the same word and different bytes (plan §2.3),
 * which is why the whole app folds.
 *
 * ## One write for the whole selection
 *
 * `onAdd` receives every selected id and the editor turns it into a single
 * `updatePlaylist` call. The picker stays open afterwards — adding a folder is
 * rarely finished after one row — and the selection is cleared only when the
 * write actually succeeded.
 */

import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import type { TrackSummary } from "@/lib/domain/track";
import { formatCount } from "@/lib/format";
import { formatClock } from "@/lib/time";
import { trackSearchFields, TITLE_FIELD } from "@/lib/librarySearch";
import { createSearchIndex, foldQuery, searchIndex } from "@/lib/search";

export function PlaylistTrackPicker({
  library,
  presentIds,
  pending,
  onAdd,
}: {
  library: TrackSummary[];
  /** Ids already in the playlist; the picker never offers them again. */
  presentIds: ReadonlySet<string>;
  /** A write is in flight elsewhere on the page. */
  pending: boolean;
  /** Resolves `true` when the write succeeded — only then is the selection cleared. */
  onAdd: (trackIds: string[]) => Promise<boolean>;
}) {
  const idPrefix = useId();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [added, setAdded] = useState<number | null>(null);

  const candidates = useMemo(
    () => library.filter((track) => !presentIds.has(track.id)),
    [library, presentIds],
  );

  const index = useMemo(
    () => createSearchIndex(candidates, trackSearchFields, TITLE_FIELD),
    [candidates],
  );

  const visible = useMemo(() => {
    const terms = foldQuery(query);
    if (terms.length === 0) {
      return candidates;
    }
    return searchIndex(index, terms).map((hit) => hit.item);
  }, [candidates, index, query]);

  const busy = pending || submitting;

  function toggle(trackId: string, checked: boolean) {
    setSelection((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(trackId);
      } else {
        next.delete(trackId);
      }
      return next;
    });
  }

  async function submit() {
    if (selection.size === 0 || busy) {
      return;
    }

    const count = selection.size;
    setSubmitting(true);
    setAdded(null);

    try {
      const succeeded = await onAdd([...selection]);
      if (succeeded) {
        setSelection(new Set());
        setAdded(count);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-[var(--space-lg)]">
      <h2 className="type-heading text-text">Add tracks</h2>

      {candidates.length === 0 ? (
        <p className="type-caption mt-[var(--space-sm)] text-text-tertiary">
          {library.length === 0
            ? "Your library is empty, so there is nothing to add yet."
            : "Every track in your library is already in this playlist."}
        </p>
      ) : (
        <>
          <div className="mt-[var(--space-md)]">
            <TextField
              label="Search the library"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="mt-[var(--space-md)] max-h-[24rem] overflow-y-auto rounded-[var(--radius-md)] border border-outline-variant">
            {visible.length === 0 ? (
              <p className="type-caption px-[var(--space-md)] py-[var(--space-lg)] text-text-tertiary">
                No track matched that name.
              </p>
            ) : (
              <ul className="flex flex-col">
                {visible.map((track) => {
                  const checkboxId = `${idPrefix}-${track.id}`;
                  return (
                    <li
                      key={track.id}
                      className="border-b border-outline-variant last:border-b-0"
                    >
                      <div className="flex items-start gap-[var(--space-md)] px-[var(--space-md)] py-[var(--space-sm)] hover:bg-surface-sunken">
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={selection.has(track.id)}
                          disabled={busy}
                          onChange={(event) => toggle(track.id, event.target.checked)}
                          className="mt-[3px] size-4 shrink-0 accent-[var(--accent)]"
                        />

                        {/*
                          The label is the text, not the whole row: a label that
                          wraps a badge and the row's padding makes a huge click
                          target that toggles a checkbox nobody meant to touch.
                        */}
                        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
                          <span className="type-body block truncate text-text">{track.title}</span>
                          <span className="type-caption type-numeric block text-text-tertiary">
                            {describeCandidate(track)}
                          </span>
                        </label>

                        {track.origin === "local" ? (
                          <Badge tone="muted" size="sm">
                            Android app only
                          </Badge>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-[var(--space-md)] flex items-center justify-between gap-[var(--space-md)]">
            {/* Announced, not just drawn: the row that was added disappears from
                the list, so the count is the only confirmation there is. */}
            <p role="status" className="type-caption text-text-tertiary">
              {added === null ? "" : `${formatCount(added, "track")} added`}
            </p>

            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => void submit()}
              disabled={busy || selection.size === 0}
              aria-busy={submitting || undefined}
            >
              Add {formatCount(selection.size, "track")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

/** `Author · 12:34`, with either half dropped when it is not known. */
function describeCandidate(track: TrackSummary): string {
  const parts: string[] = [];
  if (track.author) {
    parts.push(track.author);
  }
  // 0 means "the source did not say", not "zero seconds": printing `0:00`
  // beside a real track would read as a broken row.
  if (track.durationSec > 0) {
    parts.push(formatClock(track.durationSec));
  }
  return parts.join(" · ");
}
