"use client";

/**
 * Whether the browser has asked for motion to be reduced.
 *
 * `prefers-reduced-motion` is already handled in CSS (`globals.css` collapses
 * every animation and transition), but CSS cannot reach a path drawn by
 * JavaScript — and a wave is exactly that. A component that animates in JS must
 * therefore ask the same question the stylesheet asks, or the one thing on the
 * page that ignores the setting is the one thing that moves.
 *
 * Returns `false` during SSR and on the first client render, then the real
 * answer. That ordering is deliberate: `true` first would flash a flattened bar
 * on every navigation for the majority of listeners, who never set the flag.
 */

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function useMotionEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const apply = () => setEnabled(!media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return enabled;
}
