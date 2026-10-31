/**
 * What the player is doing, and what to say about it while it is not doing it.
 *
 * Ported from `mobile/src/lib/playbackPhase.ts`, wording included. `playing` does
 * not mean audible, so a wait is its own state and it outranks the transport
 * state. A local file opens in a few tens of milliseconds, and drawing a loader
 * for that long is a flicker that makes the app look slower than it is.
 */

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type PlaybackWaitKind = "connecting" | "buffering";

export type PlaybackWait = {
  kind: PlaybackWaitKind;
  /** Epoch ms, so a screen can say how long it has been waiting. */
  since: number;
  /** The bytes are fetched over the network rather than read from the device. */
  stream: boolean;
};

export type PlaybackPhase = "idle" | PlaybackWaitKind | "playing" | "paused" | "ended" | "error";

/** A wait outranks `playing`; an error outranks both. */
export function resolvePlaybackPhase({
  status,
  waiting,
  error,
}: {
  status: PlaybackStatus;
  waiting: PlaybackWait | null;
  error: string | null;
}): PlaybackPhase {
  if (error !== null || status === "error") {
    return "error";
  }
  if (status === "idle") {
    return "idle";
  }
  if (waiting) {
    return waiting.kind;
  }
  if (status === "playing") {
    return "playing";
  }
  // `loading` without a wait should not happen, but treating it as connecting
  // is the truthful reading rather than a pause.
  if (status === "loading") {
    return "connecting";
  }
  if (status === "ended") {
    return "ended";
  }
  return "paused";
}

export function isWaiting(phase: PlaybackPhase): boolean {
  return phase === "connecting" || phase === "buffering";
}

export type WaitStage = "hidden" | "early" | "long";

/** A wait shorter than this is not worth a loader. */
export const WAIT_REVEAL_MS = 400;

/** After this long, silence stops being self-explanatory. */
export const WAIT_LONG_MS = 6000;

/** The two boundaries a screen schedules, instead of re-rendering every second. */
export const WAIT_STEPS: readonly { atMs: number; stage: WaitStage }[] = [
  { atMs: WAIT_REVEAL_MS, stage: "early" },
  { atMs: WAIT_LONG_MS, stage: "long" },
];

export function resolveWaitStage(waitedMs: number): WaitStage {
  if (waitedMs >= WAIT_LONG_MS) {
    return "long";
  }
  if (waitedMs >= WAIT_REVEAL_MS) {
    return "early";
  }
  return "hidden";
}

export type WaitCopy = {
  label: string;
  detail: string | null;
};

/**
 * What a wait is called.
 *
 * "Connecting" means nothing has played yet and the listener may want to give
 * up; "buffering" means the track is already theirs and the connection dropped
 * mid-sentence.
 */
export function describeWait(wait: PlaybackWait, stage: WaitStage): WaitCopy {
  const long = stage === "long";

  if (wait.kind === "buffering") {
    return {
      label: long ? "Still buffering…" : "Buffering…",
      detail: long ? "Playback is paused until the next part arrives." : null,
    };
  }

  if (wait.stream) {
    return {
      label: long ? "Still not connected…" : "Connecting to the source…",
      detail: long ? "The source hasn't responded. You can stop and try again." : null,
    };
  }

  return {
    label: long ? "Taking a while to prepare…" : "Preparing audio…",
    detail: long ? "Opening this file is taking longer than usual." : null,
  };
}
