export const BASE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** Next sync delay: base interval after success, exponential backoff when failing. */
export function retryDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return BASE_SYNC_INTERVAL_MS;
  }
  return Math.min(BASE_SYNC_INTERVAL_MS * 2 ** consecutiveFailures, MAX_SYNC_INTERVAL_MS);
}
