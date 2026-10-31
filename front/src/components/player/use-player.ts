"use client";

/**
 * Hooks shared by the bar and the full player.
 *
 * The scrubber is the only consumer of `useSmoothedPosition`; everything else
 * selects whole-second store values. That split is what keeps the artwork and
 * the control row from re-rendering on every `timeupdate`.
 */

import { useEffect, useRef, useState } from "react";

import {
  ensurePlayer,
  pause,
  play,
  seek,
  seekBy,
  setVolume,
  toggleMute,
  togglePlay,
} from "@/lib/player/controller";
import {
  extrapolatePosition,
  nextAnchorPosition,
  shouldResyncToTick,
  type ProgressAnchor,
} from "@/lib/player/progressSmoothing";
import { usePlayerStore } from "@/stores/player";

/** Boot the engine once for the shell (or for a route rendered on its own). */
export function useBootPlayer(): void {
  useEffect(() => {
    ensurePlayer();
  }, []);
}

/** A whole-second position interpolated smoothly while the page is visible. */
export function useSmoothedPosition(): number {
  const positionSec = usePlayerStore((state) => state.positionSec);
  const durationSec = usePlayerStore((state) => state.durationSec);
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const playing = usePlayerStore((state) => state.status === "playing");

  const [display, setDisplay] = useState(positionSec);
  // The anchor is created on the first effect, not during render: `Date.now()`
  // is impure and a render may be discarded.
  const anchor = useRef<ProgressAnchor | null>(null);

  useEffect(() => {
    const atMs = Date.now();
    const previous =
      anchor.current ??
      ({
        positionSec,
        atMs,
        durationSec,
        playbackSpeed,
        isPlaying: playing,
      } satisfies ProgressAnchor);
    const extrapolatedSec = extrapolatePosition(previous, atMs);
    const resync = shouldResyncToTick({
      extrapolatedSec,
      previousPositionSec: previous.positionSec,
      nextPositionSec: positionSec,
      durationChanged: previous.durationSec !== durationSec,
      wasPlaying: previous.isPlaying,
      isPlaying: playing,
    });
    const next = nextAnchorPosition({
      resync,
      nextPositionSec: positionSec,
      extrapolatedSec,
    });

    anchor.current = {
      positionSec: next,
      atMs,
      durationSec,
      playbackSpeed,
      isPlaying: playing,
    };
    setDisplay(next);
  }, [positionSec, durationSec, playbackSpeed, playing]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    let frame = 0;
    const tick = () => {
      if (anchor.current) {
        setDisplay(extrapolatePosition(anchor.current, Date.now()));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return display;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/**
 * Global transport shortcuts.
 *
 * Active only while a track is loaded, never while the listener is typing, and
 * never while a dialog is open — the dialog owns Escape and its own arrows.
 * Playback direction is the media convention, not the reading direction:
 * ArrowRight moves forward even in RTL.
 */
export function usePlayerKeyboard(): void {
  const hasTrack = usePlayerStore((state) => state.current !== null);

  useEffect(() => {
    if (!hasTrack) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const inPlayer = Boolean(target?.closest("[data-player-surface]"));
      const step = event.shiftKey ? 30 : 5;

      switch (event.key) {
        case " ":
          event.preventDefault();
          void togglePlay();
          break;
        case "ArrowRight":
          event.preventDefault();
          seekBy(step);
          break;
        case "ArrowLeft":
          event.preventDefault();
          seekBy(-step);
          break;
        case "ArrowUp":
          if (inPlayer) {
            event.preventDefault();
            setVolume(Math.min(1, usePlayerStore.getState().volume + 0.05));
          }
          break;
        case "ArrowDown":
          if (inPlayer) {
            event.preventDefault();
            setVolume(Math.max(0, usePlayerStore.getState().volume - 0.05));
          }
          break;
        case "Home":
          event.preventDefault();
          seek(0);
          break;
        case "End": {
          event.preventDefault();
          const state = usePlayerStore.getState();
          seek(Math.max(0, state.durationSec - 1));
          break;
        }
        case "j":
          seekBy(-10);
          break;
        case "l":
          seekBy(10);
          break;
        case "m":
          toggleMute();
          break;
        case "k":
          pause();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasTrack]);
}

/** Used by the bar's play button and the full player's primary control. */
export function useTransport() {
  return { play, pause, togglePlay, seek, seekBy };
}
