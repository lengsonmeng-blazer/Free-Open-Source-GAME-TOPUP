export function centsFromUsd(usd: number): number {
  return Math.round(Number(usd) * 100);
}

export function usdFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatUsd(cents: number): string {
  return `$${(Math.round(cents) / 100).toFixed(2)}`;
}

/** Applies a percentage markup to a supplier cost, rounded up to the next whole cent. */
export function applyMarkup(costCents: number, markupPercent: number): number {
  const pct = Number.isFinite(markupPercent) ? markupPercent : 0;
  const raw = costCents * (1 + pct / 100);
  const rounded = Math.ceil(raw);
  // Never sell below cost, even with a negative markup.
  return Math.max(rounded, costCents);
}

/** Minimum invoice amount the payment gateway accepts (ABA PayWay requires >= $0.01). */
export const MIN_CHARGE_CENTS = 1;
