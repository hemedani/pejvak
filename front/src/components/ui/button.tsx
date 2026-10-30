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
    "transition-colors duration-150",
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
        sm: "h-9 px-[var(--space-md)] type-label rounded-[var(--radius-sm)]",
        md: "h-11 px-[var(--space-lg)] type-label rounded-[var(--radius-md)]",
        lg: "h-[52px] px-[var(--space-xl)] type-body rounded-[var(--radius-md)]",
        /** Square, for an icon-only transport control. */
        icon: "size-11 rounded-[var(--radius-md)]",
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
