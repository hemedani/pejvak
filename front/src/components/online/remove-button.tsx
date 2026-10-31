"use client";

/**
 * Taking a collection off the shelf.
 *
 * This is the one control on the page that destroys something, so it asks first
 * and it is drawn as a bordered danger button rather than a filled one: it is
 * destructive but it is not what the page is for.
 *
 * Un-favouriting is **not** this. The heart is a preference and keeps the row —
 * the listener may still want the collection in Continue. Removing deletes the
 * saved row, which is why the confirmation names the collection instead of
 * asking "are you sure?".
 *
 * The dialog is the player's own `Sheet`, not `window.confirm`: a native modal
 * blocks the page, cannot be styled, and on a phone it looks like the browser
 * rather than the app.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { removeOnlineCollection } from "@/app/actions/online/remove-online-collection";
import { Sheet } from "@/components/player/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { failureMessage } from "@/lib/messages";

export function RemoveButton({
  collection,
}: {
  collection: { sourceId: string; externalId: string; title: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);

    const result = await removeOnlineCollection({
      sourceId: collection.sourceId,
      externalId: collection.externalId,
    });

    setPending(false);

    if (!result.success) {
      setError(failureMessage(result.error));
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="danger" size="md" onClick={() => setOpen(true)}>
        <Icon name="delete" size="sm" />
        حذف از فهرست
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="حذف از فهرست"
        description={`«${collection.title}» از فهرست شما حذف می‌شود.`}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-[var(--space-sm)]">
            <Button type="button" variant="secondary" size="md" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={() => void confirm()}
              disabled={pending}
              aria-busy={pending || undefined}
            >
              {pending ? "در حال حذف…" : "حذف"}
            </Button>
          </div>
        }
      >
        <p className="type-caption text-text-secondary">
          این مجموعه از قفسهٔ شما برداشته می‌شود. تاریخ شنیدن و جای ادامه‌دادن دست‌نخورده می‌ماند،
          و می‌توانید هر وقت خواستید دوباره نشانش کنید.
        </p>

        {error ? (
          <p className="type-caption mt-[var(--space-md)] text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </Sheet>
    </>
  );
}
