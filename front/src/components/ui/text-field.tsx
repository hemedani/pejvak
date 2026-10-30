/**
 * A text field.
 *
 * The label sits **above** the track, not inside it (mobile's field system): a
 * placeholder that doubles as a label disappears the moment someone types, and
 * a Persian label inside a Persian value reads as one run of text.
 *
 * The track is `surface-sunken` with an `outline-strong` border — one step darker
 * than a card's hairline, because the field's fill is one step darker than a
 * card's fill, and the card hairline that measures 3:1 on white lands under 3:1
 * on the sunken track. A field is a control, not a card.
 *
 * Focus and error are drawn as a **ring over** the resting border, so the edge
 * thickens rather than changing shade — the only signal that survives a
 * low-contrast display.
 */

import { useId, type ComponentProps } from "react";

import { cn } from "@/lib/cn";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  /** A hint under the track. Replaced by `error` when there is one. */
  hint?: string;
  error?: string;
};

export function TextField({ label, hint, error, className, ...rest }: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <label htmlFor={id} className="type-label text-text">
        {label}
      </label>

      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          "h-[52px] w-full px-[var(--space-lg)]",
          "rounded-[var(--radius-md)] bg-surface-sunken text-text type-body",
          "border border-outline-strong",
          "placeholder:text-text-tertiary",
          "transition-[box-shadow,border-color] duration-150",
          "focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent",
          error && "border-danger ring-2 ring-[var(--danger)]",
          className,
        )}
      />

      {message ? (
        <p
          id={messageId}
          className={cn("type-caption", error ? "text-danger" : "text-text-tertiary")}
          // A validation message that appears after submit must be announced,
          // not just drawn.
          role={error ? "alert" : undefined}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
