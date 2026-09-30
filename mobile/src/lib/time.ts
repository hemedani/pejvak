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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago something happened, in the words a person would use.
 *
 * The settings screen used to print `new Date(t).toLocaleString()` — a
 * 24-character locale string like `"30/09/2026, 08:14:02"` sitting opposite its
 * label in a `space-between` row. It collided with the label, it wrapped on a
 * narrow phone, and it answered a question nobody asked: the only thing a
 * listener wants to know about "last synced" is whether it is *recent*.
 *
 * `now` is a parameter rather than a `Date.now()` read so the function stays
 * pure and testable, and so a caller rendering a list of rows cannot get two
 * different answers for the same instant.
 *
 * Anything older than a week falls back to a date, because "23 days ago" is less
 * useful than the day itself once the distance stops being the point.
 */
export function formatRelativeTime(timestamp: number | null, now: number = Date.now()): string {
  if (timestamp === null || !Number.isFinite(timestamp)) {
    return "Never";
  }

  const elapsed = now - timestamp;

  // A clock that is behind, or an event recorded in the future, is not
  // "negative time ago" — it is almost always a device clock change.
  if (elapsed < 0) {
    return "Just now";
  }
  if (elapsed < 45_000) {
    return "Just now";
  }

  const minutes = Math.floor(elapsed / MINUTE);
  if (minutes < 60) {
    return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  }

  const hours = Math.floor(elapsed / HOUR);
  if (hours < 24) {
    return hours === 1 ? "1 hr ago" : `${hours} hr ago`;
  }

  const days = Math.floor(elapsed / DAY);
  if (days < 7) {
    return days === 1 ? "Yesterday" : `${days} days ago`;
  }

  return new Date(timestamp).toLocaleDateString();
}
