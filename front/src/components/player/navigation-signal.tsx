"use client";

/**
 * Tells the player when a navigation is in flight.
 *
 * The listeners live in `lib/player/navigation.ts`; this leaf exists because the
 * disarm needs React's own signal — a committed `pathname` — and hooks cannot run
 * in the controller module. It renders nothing.
 *
 * This is a workaround, not a feature: see the header of `navigation.ts` for the
 * Next flight-client crash it avoids.
 */

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { endNavigation, startNavigationSignal } from "@/lib/player/navigation";

export function NavigationSignal() {
  const pathname = usePathname();

  useEffect(() => startNavigationSignal(), []);

  // A committed pathname is the one completion signal React has. The Navigation
  // API covers query-only commits; this covers every browser.
  useEffect(() => {
    endNavigation();
  }, [pathname]);

  return null;
}
