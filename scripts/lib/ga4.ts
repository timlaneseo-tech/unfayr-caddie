import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { google } from 'googleapis';
import type { OAuth2Client } from './auth.ts';
import type { DateWindow, Ga4PageRow } from './types.ts';

export interface Ga4Row {
  path: string;
  sessions: number;
  engagedSessions: number;
  keyEvents: number;
}

/** Strip query strings so GA4 landing pages line up with Search Console page URLs. */
export function pathOf(landing: string): string {
  const p = landing.split('?')[0].split('#')[0] || '/';
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

export function mergeWeeks(thisRows: Ga4Row[], lastRows: Ga4Row[], minSessions = 1): Ga4PageRow[] {
  const map = new Map<string, Ga4PageRow>();
  const get = (path: string) => {
    const r = map.get(path) ?? { path, sessionsThis: 0, sessionsLast: 0, engagedThis: 0, engagedLast: 0, keyEventsThis: 0, keyEventsLast: 0 };
    map.set(path, r);
    return r;
  };
  for (const r of thisRows) {
    const o = get(pathOf(r.path));
    o.sessionsThis += r.sessions;
    o.engagedThis += r.engagedSessions;
    o.keyEventsThis += r.keyEvents;
  }
  for (const r of lastRows) {
    const o = get(pathOf(r.path));
    o.sessionsLast += r.sessions;
    o.engagedLast += r.engagedSessions;
    o.keyEventsLast += r.keyEvents;
  }
  return [...map.values()].filter((r) => r.sessionsThis >= minSessions || r.sessionsLast >= minSessions).sort((a, b) => b.sessionsThis - a.sessionsThis);
}

export function ga4CacheFile(dataDir: string, propertyId: string, w: DateWindow): string {
  return join(dataDir, `ga4-${propertyId}-${w.start}_${w.end}.json`);
}

/** Landing-page sessions, engaged sessions and key events for one window, cached by date range. */
export async function pullGa4(auth: OAuth2Client, propertyId: string, w: DateWindow, dataDir: string): Promise<Ga4Row[]> {
  const file = ga4CacheFile(dataDir, propertyId, w);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Ga4Row[];
  const data = google.analyticsdata({ version: 'v1beta', auth });
  const res = await data.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: w.start, endDate: w.end }],
      dimensions: [{ name: 'landingPagePlusQueryString' }],
      metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
      limit: '5000',
    },
  });
  const rows: Ga4Row[] = (res.data.rows ?? []).map((r) => ({
    path: r.dimensionValues?.[0]?.value ?? '/',
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
    engagedSessions: Number(r.metricValues?.[1]?.value ?? 0),
    keyEvents: Number(r.metricValues?.[2]?.value ?? 0),
  }));
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(rows));
  return rows;
}
