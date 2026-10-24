/**
 * What the player is doing, and what to say about it while it is not doing it.
 *
 * The player has always had a `loading` status and never shown it. Two things
 * made that worse than a missing spinner:
 *
 *   1. **`playing` does not mean audible.** ExoPlayer reports the *intended*
 *      state, so calling `play()` on a stream makes `playing` true while the
 *      first bytes are still being fetched. A control that only asks "is it
 *      playing?" therefore draws *pause* over a track nobody can hear.
 *   2. **Resuming a paused stream enters no state at all.** It is the same
 *      fetch as the first load — a new connection, a signed URL followed
 *      again — but nothing changes until audio arrives, so the listener taps
 *      play and watches a button that did nothing.
 *
 * So a wait is its own thing here, owned by the service that starts it and
 * carrying what a screen needs to describe it: which kind of wait, since when,
 * and whether the bytes come from a source or from the device. The wording
 * lives here too, because "Connecting to the source…" is a fact about the
 * player, not a decoration a screen gets to invent.
 */

/**
 * The player's transport state.
 *
 * Declared here rather than in the store so `lib` never has to import it: the
 * store is downstream of this module, the same direction `PlaybackContext`
 * already travels.
 */
export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export type PlaybackWaitKind = "connecting" | "buffering";

/**
 * A spell of waiting: the player has been asked to play and cannot yet.
 *
 * `stream` is not a display hint. It is the difference between "we are fetching
 * this from someone else's server" and "we are opening a file on this phone",
 * and it is the reason the two waits get different words.
 */
export type PlaybackWait = {
  kind: PlaybackWaitKind;
  /** Epoch ms, so a screen can say how long it has been waiting. */
  since: number;
  /** The bytes are fetched over the network rather than read from the device. */
  stream: boolean;
};

export type PlaybackPhase = "idle" | PlaybackWaitKind | "playing" | "paused" | "ended" | "error";

/**
 * The one state the screen draws.
 *
 * A wait outranks `playing` — that is the whole point — and an error outranks
 * both, because a wait that ended badly is an error, not a wait.
 */
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
  // `loading` without a wait should not happen — `loadAndPlay` sets both — but
  // treating it as connecting is the truthful reading rather than a pause.
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

/**
 * A wait shorter than this is not worth a loader.
 *
 * A local file opens in a few tens of milliseconds; drawing "Preparing audio…"
 * for that long is a flicker that says the app is slower than it is. Only a
 * wait the listener would otherwise notice gets a voice.
 */
export const WAIT_REVEAL_MS = 400;

/** After this long, silence stops being self-explanatory. */
export const WAIT_LONG_MS = 6000;

/**
 * The boundaries the screen has to wake up on.
 *
 * Deliberately not a clock: the copy changes twice, so the player schedules two
 * timers instead of re-rendering once a second to discover nothing changed.
 */
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
  /** The line the listener reads. */
  label: string;
  /** A second sentence, once the wait has gone on long enough to need one. */
  detail: string | null;
};

/**
 * What a wait is called.
 *
 * The two waits are not the same sentence. "Connecting" means nothing has
 * played yet and the listener may want to give up; "buffering" means the track
 * is already theirs and the connection dropped mid-sentence. Saying
 * "connecting" there would suggest the track is being fetched from scratch.
 */
export function describeWait(wait: PlaybackWait, stage: WaitStage): WaitCopy {
  const long = stage === "long";

  if (wait.kind === "buffering") {
    return {
      label: long ? "Still buffering…" : "Buffering…",
      detail: long ? "Playback is paused while the next part arrives." : null,
    };
  }

  if (wait.stream) {
    return {
      label: long ? "Still connecting…" : "Connecting to the source…",
      detail: long ? "The source has not answered yet. You can stop and try again." : null,
    };
  }

  return {
    label: long ? "Still preparing…" : "Preparing audio…",
    detail: long ? "This file is taking longer than usual to open." : null,
  };
}
