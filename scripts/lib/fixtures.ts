import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays } from './paths.ts';
import type { DateWindow, GscRow } from './types.ts';

/** Directory holding the fixture sites, resolved from the plugin root. */
export const FIXTURES_DIR = fileURLToPath(new URL('../../fixtures/', import.meta.url));

export interface FixtureRow {
  query: string;
  page: string;
  day: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/**
 * Compact on-disk shape: strings are interned once and each row is a short array,
 * which keeps a 15,000-row fixture at a few hundred kilobytes instead of megabytes.
 */
export interface FixtureFile {
  queries: string[];
  pages: string[];
  /** [queryIndex, pageIndex, day, clicks, impressions, position] */
  rows: [number, number, number, number, number, number][];
}

export function encodeFixtureRows(rows: FixtureRow[]): FixtureFile {
  const queries: string[] = [];
  const pages: string[] = [];
  const qi = new Map<string, number>();
  const pi = new Map<string, number>();
  const out: FixtureFile['rows'] = [];
  for (const r of rows) {
    let q = qi.get(r.query);
    if (q === undefined) {
      q = queries.push(r.query) - 1;
      qi.set(r.query, q);
    }
    let p = pi.get(r.page);
    if (p === undefined) {
      p = pages.push(r.page) - 1;
      pi.set(r.page, p);
    }
    out.push([q, p, r.day, r.clicks, r.impressions, r.position]);
  }
  return { queries, pages, rows: out };
}

export function decodeFixtureRows(file: FixtureFile): FixtureRow[] {
  return file.rows.map(([q, p, day, clicks, impressions, position]) => ({
    query: file.queries[q],
    page: file.pages[p],
    day,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position,
  }));
}

export function readFixtureRows(fixtureDir: string): FixtureRow[] {
  return decodeFixtureRows(JSON.parse(readFileSync(join(fixtureDir, 'gsc-rows.json'), 'utf8')) as FixtureFile);
}

/**
 * Place day-indexed rows on real dates: day 0 is the first day of the prior window,
 * day 55 the last day of the current one.
 */
export function placeOnDates(rows: FixtureRow[], prior: DateWindow, current: DateWindow): { current: GscRow[]; prior: GscRow[] } {
  const out = { current: [] as GscRow[], prior: [] as GscRow[] };
  for (const r of rows) {
    const inPrior = r.day < 28;
    const date = inPrior ? addDays(prior.start, r.day) : addDays(current.start, r.day - 28);
    const row: GscRow = { query: r.query, page: r.page, date, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
    (inPrior ? out.prior : out.current).push(row);
  }
  return out;
}
