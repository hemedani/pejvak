/** Formats integer seconds as `m:ss`, or `h:mm:ss` once past an hour. */
export function formatClock(totalSec: number): string {
  const safe = Number.isFinite(totalSec) ? totalSec : 0;
  const seconds = Math.max(0, Math.floor(safe));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}
