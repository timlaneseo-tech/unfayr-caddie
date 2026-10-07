import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';
import type { OAuth2Client } from './auth.ts';
import { addDays, todayIso } from './paths.ts';
import type { DateWindow, GscRow } from './types.ts';

/** Search Console returns at most this many rows per request. */
export const GSC_ROW_LIMIT = 25000;

/**
 * Search Console data lags about two days, and the last day is often partial.
 * Ending the window three days before today keeps every day in it final, so the
 * same date range gives the same numbers tomorrow.
 */
export const GSC_LAG_DAYS = 3;

export function windows(today: Date = new Date(), lag = GSC_LAG_DAYS, days = 28): { current: DateWindow; prior: DateWindow } {
  const end = addDays(todayIso(today), -lag);
  const start = addDays(end, -(days - 1));
  const priorEnd = addDays(start, -1);
  const priorStart = addDays(priorEnd, -(days - 1));
  return { current: { start, end }, prior: { start: priorStart, end: priorEnd } };
}

/**
 * Page through a query until a page comes back short. The API has no total count,
 * so a full page means "ask again from startRow + rowLimit".
 */
export async function fetchAllRows(
  queryPage: (startRow: number) => Promise<GscRow[]>,
  rowLimit = GSC_ROW_LIMIT,
): Promise<GscRow[]> {
  const all: GscRow[] = [];
  let startRow = 0;
  for (;;) {
    const rows = await queryPage(startRow);
    all.push(...rows);
    if (rows.length < rowLimit) break;
    startRow += rowLimit;
  }
  return all;
}

export interface Aggregate {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

export function aggKey(query: string, page: string): string {
  return `${query}\u0000${page}`;
}

/**
 * Collapse daily rows to one row per query+page. Position is impression-weighted
 * because a day with 300 impressions says more about where the page sits than a
 * day with 3.
 */
export function aggregate(rows: GscRow[], normalisePage: (p: string) => string = (p) => p): Map<string, Aggregate> {
  const out = new Map<string, Aggregate & { posWeight: number }>();
  for (const r of rows) {
    const page = normalisePage(r.page);
    const k = aggKey(r.query, page);
    let a = out.get(k);
    if (!a) {
      a = { query: r.query, page, clicks: 0, impressions: 0, position: 0, posWeight: 0 };
      out.set(k, a);
    }
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.posWeight += r.position * r.impressions;
  }
  const result = new Map<string, Aggregate>();
  for (const [k, a] of out) {
    result.set(k, {
      query: a.query,
      page: a.page,
      clicks: a.clicks,
      impressions: a.impressions,
      position: a.impressions > 0 ? a.posWeight / a.impressions : 0,
    });
  }
  return result;
}

export function cacheFile(dataDir: string, w: DateWindow): string {
  return join(dataDir, `gsc-${w.start}_${w.end}.json`);
}

export interface PullResult {
  rows: GscRow[];
  fromCache: boolean;
  file: string;
}

/**
 * Pull one window with dimensions query, page, date. The result is cached by date
 * range, so a second run on the same day reads the file instead of the API.
 */
export async function pullWindow(auth: OAuth2Client, siteUrl: string, w: DateWindow, dataDir: string): Promise<PullResult> {
  const file = cacheFile(dataDir, w);
  if (existsSync(file)) {
    return { rows: JSON.parse(readFileSync(file, 'utf8')) as GscRow[], fromCache: true, file };
  }
  const sc = google.searchconsole({ version: 'v1', auth });
  const rows = await fetchAllRows(async (startRow) => {
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: w.start,
        endDate: w.end,
        dimensions: ['query', 'page', 'date'],
        rowLimit: GSC_ROW_LIMIT,
        startRow,
        type: 'web',
      },
    });
    return (res.data.rows ?? []).map((r) => ({
      query: r.keys?.[0] ?? '',
      page: r.keys?.[1] ?? '',
      date: r.keys?.[2] ?? '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
  });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(rows));
  return { rows, fromCache: false, file };
}
