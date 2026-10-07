import { aggregate, GSC_LAG_DAYS } from './gsc.ts';
import { addDays, todayIso } from './paths.ts';
import type { DateWindow, GscRow, PageMove, WeekTotals } from './types.ts';
import { normalisePage } from './urls.ts';

/** Two back-to-back 7-day windows ending GSC_LAG_DAYS before today, so every day is final. */
export function weekWindows(today: Date = new Date(), lag = GSC_LAG_DAYS): { thisWeek: DateWindow; lastWeek: DateWindow } {
  const end = addDays(todayIso(today), -lag);
  const start = addDays(end, -6);
  const lastEnd = addDays(start, -1);
  const lastStart = addDays(lastEnd, -6);
  return { thisWeek: { start, end }, lastWeek: { start: lastStart, end: lastEnd } };
}

export function inWindow(date: string, w: DateWindow): boolean {
  return date >= w.start && date <= w.end;
}

export function weekTotals(rows: GscRow[], w: DateWindow): WeekTotals {
  let clicks = 0;
  let impressions = 0;
  let posWeight = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    posWeight += r.position * r.impressions;
  }
  return {
    ...w,
    clicks,
    impressions,
    ctr: impressions ? Math.round((clicks / impressions) * 10000) / 10000 : 0,
    position: impressions ? Math.round((posWeight / impressions) * 10) / 10 : 0,
  };
}

/** Impression-weighted position of one query on one page within a set of rows, or null when unseen. */
export function positionFor(rows: GscRow[], query: string, page: string): number | null {
  const target = normalisePage(page);
  let w = 0;
  let imp = 0;
  for (const r of rows) {
    if (r.query !== query || normalisePage(r.page) !== target) continue;
    w += r.position * r.impressions;
    imp += r.impressions;
  }
  return imp ? Math.round((w / imp) * 10) / 10 : null;
}

interface PageAgg {
  impressions: number;
  posWeight: number;
  topQuery: string;
  topImp: number;
}

function byPage(rows: GscRow[]): Map<string, PageAgg> {
  const out = new Map<string, PageAgg>();
  for (const a of aggregate(rows, normalisePage).values()) {
    const p = out.get(a.page) ?? { impressions: 0, posWeight: 0, topQuery: '', topImp: 0 };
    p.impressions += a.impressions;
    p.posWeight += a.position * a.impressions;
    if (a.impressions > p.topImp) {
      p.topImp = a.impressions;
      p.topQuery = a.query;
    }
    out.set(a.page, p);
  }
  return out;
}

/**
 * Pages whose impression-weighted position moved by at least `minDelta` between the two
 * weeks, with at least `minImpressions` in the current week so a single search cannot
 * make a page look like it jumped.
 */
export function pageMoves(thisRows: GscRow[], lastRows: GscRow[], opts: { minImpressions: number; minDelta?: number; exclude?: Set<string> }): { up: PageMove[]; down: PageMove[] } {
  const minDelta = opts.minDelta ?? 1;
  const cur = byPage(thisRows);
  const prev = byPage(lastRows);
  const moves: PageMove[] = [];
  for (const [page, c] of cur) {
    if (opts.exclude?.has(page)) continue;
    const p = prev.get(page);
    // Both weeks need real impressions, or a page seen five times can look like it leapt twenty places.
    if (!p || c.impressions < opts.minImpressions || p.impressions < Math.ceil(opts.minImpressions / 2)) continue;
    const positionThis = c.posWeight / c.impressions;
    const positionLast = p.posWeight / p.impressions;
    const delta = Math.round((positionLast - positionThis) * 10) / 10; // positive = improved
    if (Math.abs(delta) < minDelta) continue;
    moves.push({ page, impressions: c.impressions, positionLast: Math.round(positionLast * 10) / 10, positionThis: Math.round(positionThis * 10) / 10, delta, topQuery: c.topQuery });
  }
  const up = moves.filter((m) => m.delta > 0).sort((a, b) => b.delta * b.impressions - a.delta * a.impressions).slice(0, 8);
  const down = moves.filter((m) => m.delta < 0).sort((a, b) => a.delta * b.impressions - b.delta * a.impressions).slice(0, 8);
  return { up, down };
}
