"use client";

/**
 * The theme switch.
 *
 * ## The DOM class is the state, and this component subscribes to it
 *
 * There are two ways to know the current theme, and only one of them is
 * correct. A `useState` copy has to be *seeded* after mount — the server cannot
 * know whether the bootstrap script added `.dark`, because the no-cookie branch
 * is a `prefers-color-scheme` media query and that only exists in the browser.
 * Seeding it from a `useEffect` is a `setState` during an effect: a second
 * render on every mount, and a component that is briefly wrong about its own
 * label.
 *
 * `<html class="dark">` is external state that already exists and is already
 * the truth (the CSS reads it, and the bootstrap wrote it). So this is the
 * textbook `useSyncExternalStore` case: read it, subscribe to changes made by
 * anyone, and let React handle the server/client difference — the server
 * snapshot is `false`, the client snapshot is the class, and React re-syncs
 * after hydration without a mismatch warning.
 *
 * ## Two things happen on click, in this order
 *
 * The class flips (so the page repaints this frame) and the cookie is written
 * (so the *next* server render agrees). Doing it the other way round means a
 * round trip before the screen changes, and a theme switch that lags by 200 ms
 * reads as broken.
 *
 * The cookie is deliberately not `httpOnly` — a theme is not a secret, and
 * making it server-only would cost a Server Action per toggle.
 */

import { useSyncExternalStore } from "react";

import { Icon } from "@/components/ui/icon";

const COOKIE = "theme";
const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

/**
 * The server has no DOM, and the cookie is only half the answer (no cookie
 * means "follow the system"). `false` is the honest guess: React replaces it
 * with the real value immediately after hydration.
 */
function getServerSnapshot(): boolean {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    document.cookie = `${COOKIE}=${next ? "dark" : "light"}; path=/; max-age=${ONE_YEAR_SEC}; samesite=lax`;

    // The store is the DOM, so the change is already visible to CSS. Notifying
    // is what makes *this* button re-render — and any other subscriber, which
    // is why the notification goes through the set rather than a local setState.
    for (const listener of listeners) {
      listener();
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "تغییر به پوستهٔ روشن" : "تغییر به پوستهٔ تاریک"}
      aria-pressed={dark}
      className="grid size-11 place-items-center rounded-[var(--radius-md)] text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <Icon name={dark ? "light" : "dark"} size="lg" />
    </button>
  );
}
