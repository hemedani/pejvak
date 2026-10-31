/**
 * What the player is doing, and what to say about it while it is not doing it.
 *
 * Ported from `mobile/src/lib/playbackPhase.ts`. The reasoning travels with it:
 * `playing` does not mean audible, so a wait is its own state and it outranks
 * the transport state. Only the wording is new, because the web is Persian-only
 * (D10). A local file opens in a few tens of milliseconds, and drawing a loader
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
      label: long ? "هنوز در حال بارگذاری…" : "در حال بارگذاری…",
      detail: long ? "پخش تا رسیدن بخش بعدی متوقف است." : null,
    };
  }

  if (wait.stream) {
    return {
      label: long ? "هنوز وصل نشده…" : "در حال اتصال به منبع…",
      detail: long ? "منبع پاسخ نداده است. می‌توانید متوقف کنید و دوباره تلاش کنید." : null,
    };
  }

  return {
    label: long ? "آماده‌سازی طول کشیده…" : "در حال آماده‌سازی صدا…",
    detail: long ? "باز کردن این فایل بیشتر از حد معمول طول می‌کشد." : null,
  };
}
