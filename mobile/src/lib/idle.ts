/**
 * Running work when the JS thread has nothing better to do.
 *
 * `InteractionManager.runAfterInteractions` is deprecated in RN 0.86, and its
 * replacement is the idle callback — which is not a drop-in swap, because the
 * two promise different things:
 *
 *   · `runAfterInteractions` queued behind a *known* set of interactions: a
 *     navigation transition, a touch that had not been released. It always
 *     ran, because the queue always drained.
 *   · An idle callback runs when the runtime reports idle time. A continuous
 *     animation, a list still settling, or a burst of network work can keep
 *     that from happening for a long time. So `timeoutMs` is not optional
 *     here: it is the promise that the work still runs, only later.
 *
 * That is the whole point of this wrapper — it makes the deadline explicit at
 * every call site instead of leaving "and it will happen eventually" as an
 * assumption nobody wrote down.
 */

/** The idle deadline, as much of it as a caller here needs. */
type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

/**
 * The globals, typed loosely on purpose.
 *
 * React Native installs these itself (`setUpTimers`), and the handle is opaque
 * — a number through `JSTimers`, an opaque native id in bridgeless mode — so it
 * is only ever handed straight back to the matching cancel.
 */
type IdleHost = {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadline) => void,
    options?: { timeout?: number },
  ) => unknown;
  cancelIdleCallback?: (handle: unknown) => void;
};

const host = globalThis as unknown as IdleHost;

export type IdleTask = {
  /** Drops the work if it has not run yet. Safe to call twice. */
  cancel: () => void;
};

/**
 * Run `task` on the next idle period, or after `timeoutMs` — whichever is first.
 *
 * Returns a handle rather than a bare id so a screen can cancel on blur without
 * knowing which of the two paths scheduled it.
 */
export function runWhenIdle(task: () => void, timeoutMs: number): IdleTask {
  const request = host.requestIdleCallback;
  const cancelIdle = host.cancelIdleCallback;

  if (typeof request === "function" && typeof cancelIdle === "function") {
    const handle = request(() => task(), { timeout: timeoutMs });
    return { cancel: () => cancelIdle(handle) };
  }

  // A runtime with no idle events — Jest, or anything that has not installed
  // React Native's timers. The timeout is all that is left to honour.
  const handle = setTimeout(task, timeoutMs);
  return { cancel: () => clearTimeout(handle) };
}
