/** Sleep-timer durations offered in the player, in minutes. */
export const SLEEP_TIMER_CHOICES = [5, 15, 30, 45, 60] as const;

export type SleepTimerChoice = (typeof SLEEP_TIMER_CHOICES)[number];

/** Wall-clock deadline for a sleep timer started now for `minutes` minutes. */
export function sleepDeadlineMs(nowMs: number, minutes: number): number {
  return nowMs + minutes * 60_000;
}

/** Remaining time as `m:ss` (or `h:mm:ss` past an hour), rounded up. */
export function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
