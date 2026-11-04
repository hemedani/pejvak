/** The `YYYY-MM` UTC month the AI meter is counting against. */
export const currentPeriodKey = (): string =>
  new Date().toISOString().slice(0, 7);
