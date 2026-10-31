"use client";

/**
 * The inline create form.
 *
 * It sits above the list and stays visible in the empty state, because that is
 * the state it exists for: an empty-state `EmptyState` with a "create" button
 * would be a second control pointing at a form that is already on screen.
 *
 * Enter submits — it is a real `<form onSubmit>`, not a button handler — and on
 * success the field is cleared and keeps focus, so creating three playlists in a
 * row is three typings rather than three clicks back into the field.
 *
 * A blank or whitespace-only title never leaves the browser: the button is
 * disabled and the handler returns early. The action checks the same rule again
 * because a Server Action is a public endpoint.
 */

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { createPlaylist } from "@/app/actions/playlists/create-playlist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { PLAYLIST_TITLE_MAX } from "@/lib/domain/playlist-query";
import { failureMessage } from "@/lib/messages";

export function PlaylistCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = title.trim();
  const disabled = pending || trimmed.length === 0;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await createPlaylist({ title: trimmed });

      if (!result.success) {
        setError(failureMessage(result.error));
        return;
      }

      setTitle("");
      // The field is still mounted and still focused after Enter; this covers
      // the case where the re-render moved focus to the body.
      inputRef.current?.focus();
      router.refresh();
    });
  }

  return (
    <Card className="p-[var(--space-lg)]">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-[var(--space-md)] sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <TextField
            ref={inputRef}
            label="New playlist"
            placeholder="Playlist name"
            maxLength={PLAYLIST_TITLE_MAX}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" disabled={disabled}>
          Create
        </Button>
      </form>

      {error ? (
        <div
          role="alert"
          className="mt-[var(--space-md)] flex items-start gap-[var(--space-sm)] rounded-[var(--radius-md)] bg-danger-soft px-[var(--space-md)] py-[var(--space-sm)] text-danger"
        >
          <Icon name="error" size="sm" className="mt-[2px] shrink-0" />
          <p className="type-caption">{error}</p>
        </div>
      ) : null}
    </Card>
  );
}
