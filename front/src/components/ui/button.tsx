/**
 * Buttons.
 *
 * Four variants, and the difference between them is meaning, not taste:
 *
 *   · `primary` — the one action a view exists for. Accent fill, `onAccent` text.
 *   · `secondary` — a real action that is not the main one. Surface fill, hairline.
 *   · `ghost` — a control in a row of controls (transport, toolbar).
 *   · `danger` — destructive. Never used for "cancel".
 *
 * `primary` is deliberately *not* a saturated full-width CTA per viewport: that
 * is the reference product's language, not this one (plan §7, closing note).
 */

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const button = cva(
  [
    "inline-flex items-center justify-center gap-[var(--space-sm)]",
    "font-[var(--font-sans)] font-semibold whitespace-nowrap",
    /*
     * Press feedback is physical: the control gives a little under the finger and
     * comes back. Ported from the phone's `ElasticPressable`, which is the whole
     * reason a tap there feels answered. 0.97 rather than 0.9 — a large press
     * scale on a 36px control reads as a wobble, not as a press.
     */
    "transition-[background-color,color,transform,scale,filter] duration-[var(--motion-fast)] ease-[var(--ease-out)] active:scale-[0.97] motion-reduce:scale-100",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:brightness-110 active:brightness-95",
        secondary:
          "bg-surface text-text border border-outline-strong hover:bg-surface-sunken active:bg-surface-sunken",
        ghost: "bg-transparent text-text-secondary hover:bg-surface-sunken hover:text-text",
        danger: "bg-transparent text-danger border border-danger/40 hover:bg-danger-soft",
      },
      size: {
        /** A dense row's control. The hit area is restored by `hit-area`. */
        sm: "h-[var(--control-sm)] px-[var(--space-md)] type-label rounded-[var(--radius-sm)] coarse:h-[var(--control-md)]",
        md: "h-[var(--control-md)] px-[var(--space-lg)] type-label rounded-[var(--radius-md)]",
        lg: "h-[var(--control-lg)] px-[var(--space-xl)] type-body rounded-[var(--radius-md)]",
        /** Square, for an icon-only transport control. */
        icon: "size-[var(--control-md)] rounded-[var(--radius-md)]",
        /** Square and dense, for a control inside a row that is already a list. */
        iconSm: "size-[var(--control-sm)] rounded-[var(--radius-sm)] coarse:size-[var(--control-md)]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof button> & {
    /** Renders as the child element — for a `<Link>` that must look like a button. */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...rest }: ButtonProps) {
  const Element = asChild ? Slot : "button";
  return <Element {...rest} className={cn(button({ variant, size }), className)} />;
}
