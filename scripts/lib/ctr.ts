/**
 * Organic click-through rate by Google ranking position.
 *
 * Source for positions 1-10: First Page Sage, "Google Click-Through Rates (CTRs) by
 * Ranking Position", September 2026 edition.
 * https://firstpagesage.com/reports/google-click-through-rates-ctrs-by-ranking-position/
 * Blended across SERPs with and without AI answers: 7.1, 3.0, 1.7, 1.1, 0.7, 0.6, 0.4,
 * 0.3, 0.2, 0.2 percent.
 *
 * Positions 11-20 are not in that report. They are extrapolated here as a straight
 * line from 0.15% at 11 to 0.05% at 20, which is below position 10 and above zero.
 *
 * The curve is used only to rank opportunities against each other (how many clicks a
 * query would gain if it moved to position 3), so its absolute level matters far less
 * than its shape. Swap in your own measured curve by editing this one array.
 */
export const CTR_BY_POSITION: readonly number[] = [
  NaN, // index 0 unused; positions are 1-based
  0.071, 0.03, 0.017, 0.011, 0.007, 0.006, 0.004, 0.003, 0.002, 0.002,
  0.0015, 0.001389, 0.001278, 0.001167, 0.001056, 0.000944, 0.000833, 0.000722, 0.000611, 0.0005,
];

export const MAX_POSITION = CTR_BY_POSITION.length - 1;

/** CTR at a fractional position, linearly interpolated, clamped to 1..20. */
export function ctrAt(position: number): number {
  if (!Number.isFinite(position)) return CTR_BY_POSITION[MAX_POSITION];
  const p = Math.min(MAX_POSITION, Math.max(1, position));
  const lo = Math.floor(p);
  const hi = Math.min(MAX_POSITION, lo + 1);
  const t = p - lo;
  return CTR_BY_POSITION[lo] + (CTR_BY_POSITION[hi] - CTR_BY_POSITION[lo]) * t;
}

/**
 * Clicks a query would gain per 28 days if it moved from `position` to `target`.
 * Zero when the query is already at or above the target.
 */
export function opportunity(impressions: number, position: number, target = 3): number {
  const gap = ctrAt(target) - ctrAt(position);
  return gap > 0 ? impressions * gap : 0;
}
