/**
 * AI credit grants.
 *
 * The meter is a per-month row (`periodKey` is `YYYY-MM`), and a grant adds to
 * its bonus pool rather than lowering consumption. The panel reports the pool
 * and the consumption separately because lowering "used" would rewrite history.
 */

import { asNumber, asRecord, asString } from "@/lib/parse";

export type AiCreditGrant = {
  userId: string | null;
  periodKey: string | null;
  granted: number;
  bonusCredits: number;
  creditsUsed: number;
};

export const AI_USAGE_GET = {
  userId: 1,
  periodKey: 1,
  granted: 1,
  bonusCredits: 1,
  creditsUsed: 1,
} as const;

export function parseAiCreditGrant(raw: unknown): AiCreditGrant | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  return {
    userId: asString(record.userId),
    periodKey: asString(record.periodKey),
    granted: asNumber(record.granted) ?? 0,
    bonusCredits: asNumber(record.bonusCredits) ?? 0,
    creditsUsed: asNumber(record.creditsUsed) ?? 0,
  };
}

/** The current UTC month as `YYYY-MM`. Mirrors the backend's default. */
export function currentPeriodKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7);
}
