"use client";

/**
 * One event for "open the queue".
 *
 * The queue sheet lives with the bar because the bar is on every shell page;
 * the sidebar's queue slot and the full player both only need to ask for it.
 * A window event keeps those three components from learning about each other.
 */

export const OPEN_QUEUE_EVENT = "pejvak:open-queue";
export const OPEN_NOTE_EVENT = "pejvak:open-note";

export function requestOpenQueue(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(OPEN_QUEUE_EVENT));
}

export function requestOpenNote(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(OPEN_NOTE_EVENT));
}
