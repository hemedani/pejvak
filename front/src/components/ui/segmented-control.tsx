"use client";

/**
 * One choice among a few, drawn as adjacent segments.
 *
 * Plan §7 rule 6 draws the line this sits on: **a chip is a filter, a segmented
 * control is a choice.** A row of pills that all toggle independently says "narrow
 * this list"; this says "exactly one of these", and the difference is carried by
 * the shape — one track, one raised segment, no gaps — rather than by a label.
 * `Badge` is the chip. This is the control.
 *
 * ## Native radios, not `role="radiogroup"` and a key handler
 *
 * A radio group already *is* one: arrow keys move and select, the tab stop is
 * the group rather than each option, and a screen reader announces "3 of 5".
 * Re-implementing that with buttons means re-implementing all three, and getting
 * the announcement wrong is silent. The inputs are `sr-only` rather than
 * `display:none`, because a hidden input is not focusable and the whole keyboard
 * story goes with it.
 *
 * ## The selected segment is the app's one "you are here" signal
 *
 * `bg-accent-soft`, the same fill the sidebar uses for the current page and
 * `BrowseTabs` for the current shelf. A shadow was the other candidate and it is
 * the wrong one: elevation on this canvas means "floats above the page", and a
 * segment inside a card does not.
 *
 * ## It is controlled, and it does not save
 *
 * The caller owns the value and decides what a change means — here, a Server
 * Action. A control that saved its own value would be the second place that
 * knows how to reach the backend.
 */

import { useId } from "react";

import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string | number> = {
  value: T;
  /** Short. A segment is a word, not a sentence. */
  label: string;
};

export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: {
  /** The group's name, announced once. Rendered as a `legend`, not a visible row. */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const name = useId();

  return (
    // `w-full` on the fieldset itself: a `fieldset` shrink-wraps to its content
    // in a column, so a caller's `max-w-*` would cap nothing and the segments
    // would be as narrow as their labels. The width has to be stated here, once,
    // rather than remembered at each call site.
    <fieldset disabled={disabled} className={cn("w-full min-w-0", className)}>
      <legend className="sr-only">{label}</legend>

      <div
        className={cn(
          "flex w-full gap-[var(--space-xxs)] rounded-[var(--radius-md)] p-[var(--space-xxs)]",
          "border border-outline-variant bg-surface-sunken",
        )}
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <label
              key={String(option.value)}
              className={cn(
                "relative flex h-[var(--control-sm)] min-w-0 flex-1 cursor-pointer select-none items-center justify-center",
                "rounded-[var(--radius-sm)] px-[var(--space-sm)] coarse:h-[var(--control-md)]",
                "type-label whitespace-nowrap transition-colors duration-[var(--motion-fast)]",
                // `has-[:focus-visible]`, not `focus-within`: clicking a radio
                // focuses it too, and a ring that stays on every mouse click
                // reads as a stuck focus rather than as a keyboard affordance.
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]",
                // No hover fill: the track behind a segment is already
                // `surface-sunken`, so a sunken hover is invisible and a surface
                // hover is indistinguishable from the selected segment. The text
                // darkening is the only honest signal available.
                selected ? "bg-accent-soft text-text" : "text-text-secondary hover:text-text",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="truncate">{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
