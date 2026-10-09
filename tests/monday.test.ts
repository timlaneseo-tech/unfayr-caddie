import { describe, expect, it } from 'vitest';
import { mergeWeeks, pathOf } from '../scripts/lib/ga4.ts';
import { applyObservations } from '../scripts/lib/ledger.ts';
import { buildMemo, renderMemoReadme } from '../scripts/lib/memo.ts';
import { classifyChange, expectedText, quotedPhrases } from '../scripts/lib/status.ts';
import type { GscRow, Ledger, LedgerEntry, PageExtract } from '../scripts/lib/types.ts';
import { pageMoves, positionFor, weekTotals, weekWindows } from '../scripts/lib/weeks.ts';

const row = (over: Partial<GscRow>): GscRow => ({ query: 'q', page: 'https://x.example/a', date: '2026-10-01', clicks: 1, impressions: 100, ctr: 0.01, position: 8, ...over });

function extractOf(over: Partial<PageExtract>): PageExtract {
  return {
    url: 'https://x.example/a', fetchedAt: '', status: 'ok', httpStatus: 200, title: 'Old Title', metaDescription: null, canonical: null, h1: 'Old H1',
    headings: [{ level: 2, text: 'Other Causes' }], paragraphs: ['Some paragraph text here.'], wordCount: 300, jsonLd: [], faq: [], contentHash: 'hash-old', ...over,
  };
}

const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'id1', date: '2026-10-01', run: 'runs/2026-10-01/find', page: 'https://x.example/a', kind: 'h2', queries: ['leak from bottom'],
  summary: 'Rename "Other Causes" to "Why is my water heater leaking from the bottom?"', contentHash: 'hash-old', positionAtTime: 7.4, impressionsAtTime: 1900, status: 'proposed', ...over,
});

describe('weeks', () => {
  it('builds two 7-day windows ending three days ago', () => {
    const w = weekWindows(new Date('2026-10-07T12:00:00Z'));
    expect(w.thisWeek).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(w.lastWeek).toEqual({ start: '2026-09-21', end: '2026-09-27' });
  });

  it('totals a week with impression-weighted position', () => {
    const t = weekTotals([row({ impressions: 100, clicks: 2, position: 4 }), row({ impressions: 300, clicks: 6, position: 8 })], { start: 'a', end: 'b' });
    expect(t).toEqual({ start: 'a', end: 'b', clicks: 8, impressions: 400, ctr: 0.02, position: 7 });
  });

  it('finds a query position on a page, tolerating URL variants', () => {
    const rows = [row({ query: 'leak', page: 'https://x.example/a/', position: 6, impressions: 50 }), row({ query: 'leak', page: 'https://x.example/a?utm=1', position: 8, impressions: 50 })];
    expect(positionFor(rows, 'leak', 'https://x.example/a')).toBe(7);
    expect(positionFor(rows, 'other', 'https://x.example/a')).toBeNull();
  });

  it('lists movers above the floor and excludes ledger pages', () => {
    const last = [row({ page: 'https://x.example/up', position: 12 }), row({ page: 'https://x.example/down', position: 5 }), row({ page: 'https://x.example/ledger', position: 12 }), row({ page: 'https://x.example/tiny', position: 12, impressions: 2 })];
    const cur = [row({ page: 'https://x.example/up', position: 8 }), row({ page: 'https://x.example/down', position: 9 }), row({ page: 'https://x.example/ledger', position: 6 }), row({ page: 'https://x.example/tiny', position: 3, impressions: 2 })];
    const m = pageMoves(cur, last, { minImpressions: 5, exclude: new Set(['https://x.example/ledger']) });
    expect(m.up.map((x) => x.page)).toEqual(['https://x.example/up']);
    expect(m.up[0].delta).toBe(4);
    expect(m.down.map((x) => x.page)).toEqual(['https://x.example/down']);
    expect(m.down[0].delta).toBe(-4);
  });
});

describe('status', () => {
  it('pulls quoted phrases from a summary', () => {
    expect(quotedPhrases('Rename "Other Causes" to "Why is my water heater leaking from the bottom?"')).toEqual(['Other Causes', 'Why is my water heater leaking from the bottom?']);
    expect(quotedPhrases('Meta: the boilerplate replaced')).toEqual([]);
  });

  it('classifies applied, changed, unchanged, gone and unknown', () => {
    const e = entry({});
    expect(classifyChange(e, extractOf({ contentHash: 'hash-new', headings: [{ level: 2, text: 'Why is my water heater leaking from the bottom?' }] })).status).toBe('applied');
    expect(classifyChange(e, extractOf({ contentHash: 'hash-new' })).status).toBe('changed');
    expect(classifyChange(e, extractOf({})).status).toBe('unchanged');
    expect(classifyChange(e, extractOf({ status: 'failed', httpStatus: 404, contentHash: null })).status).toBe('gone');
    expect(classifyChange(e, extractOf({ status: 'failed', httpStatus: null, error: 'timeout', contentHash: null })).status).toBe('unknown');
  });

  it('treats a title change as applied when the new title is live, ignoring case and curly quotes', () => {
    const e = entry({ kind: 'title', summary: 'Title: "Why Is My Water Heater Leaking? Bottom, Top and Valve Leaks"' });
    expect(classifyChange(e, extractOf({ contentHash: 'x', title: 'why is my water heater leaking? bottom, top and valve leaks' })).status).toBe('applied');
  });

  it('prefers lookFor, falls back to the summary convention, and never guesses from a location quote', () => {
    expect(expectedText({ kind: 'faq', summary: 'FAQ block with five price questions before "Get a Quote"', lookFor: undefined })).toBeNull();
    expect(expectedText({ kind: 'faq', summary: 'FAQ block with five price questions before "Get a Quote"', lookFor: 'How much does it cost to unclog a drain?' })).toBe('How much does it cost to unclog a drain?');
    expect(expectedText({ kind: 'title', summary: 'Title: "Plumber Cost in Boise: Hourly Rates and Typical Prices"' })).toBe('Plumber Cost in Boise: Hourly Rates and Typical Prices');
    expect(expectedText({ kind: 'h2', summary: 'Rename "Pricing" to "How much does drain cleaning cost in Boise?" with the range first' })).toBe('How much does drain cleaning cost in Boise?');
    expect(expectedText({ kind: 'meta', summary: 'Meta: the boilerplate replaced with the answer' })).toBeNull();
    // A FAQ whose only quote is where to put it can never read as applied, only changed or unchanged.
    const e = entry({ kind: 'faq', summary: 'FAQ block with five price questions before "Get a Quote"' });
    expect(classifyChange(e, extractOf({ contentHash: 'x', headings: [{ level: 2, text: 'Get a Quote' }] })).status).toBe('changed');
  });

  it('treats a redirect as applied once the page is gone or canonicalised elsewhere', () => {
    const e = entry({ kind: 'redirect', summary: 'Redirect the Brainerd page to the locations page' });
    expect(classifyChange(e, extractOf({})).status).toBe('unchanged');
    expect(classifyChange(e, extractOf({ status: 'failed', httpStatus: 404, contentHash: null })).status).toBe('applied');
    expect(classifyChange(e, extractOf({ canonical: 'https://x.example/locations' })).status).toBe('applied');
  });

  it('does not call a change "changed" when there was no snapshot to compare with', () => {
    const e = entry({ contentHash: null });
    const c = classifyChange(e, extractOf({ contentHash: 'anything' }));
    expect(c.status).toBe('unknown');
    expect(c.detail).toMatch(/no snapshot/);
    expect(classifyChange(e, extractOf({ headings: [{ level: 2, text: 'Why is my water heater leaking from the bottom?' }] })).status).toBe('applied');
    expect(classifyChange(entry({ contentHash: null, kind: 'new-page', summary: 'New page: X' }), extractOf({})).status).toBe('unknown');
  });

  it('never claims a new page was created from the ranking page alone', () => {
    const e = entry({ kind: 'new-page', summary: 'New post: Does Drano Damage Pipes?' });
    expect(classifyChange(e, extractOf({})).status).toBe('unchanged');
    expect(classifyChange(e, extractOf({ contentHash: 'x' })).detail).toMatch(/not checked/);
  });
});

describe('memo', () => {
  const weeks = weekWindows(new Date('2026-10-07T12:00:00Z'));
  const thisRows = [row({ query: 'leak from bottom', position: 5, impressions: 200, clicks: 10, date: '2026-10-01' }), row({ query: 'x', page: 'https://x.example/b', position: 6, impressions: 60 })];
  const lastRows = [row({ query: 'leak from bottom', position: 7, impressions: 180, clicks: 5, date: '2026-09-24' }), row({ query: 'x', page: 'https://x.example/b', position: 10, impressions: 50 })];

  it('builds the memo data with change status and per-query positions', () => {
    const memo = buildMemo({
      site: 'sc-domain:x.example', date: '2026-10-07', thisWeek: weeks.thisWeek, lastWeek: weeks.lastWeek, thisRows, lastRows,
      ledger: [entry({})],
      extracts: new Map([['https://x.example/a', extractOf({ contentHash: 'new', headings: [{ level: 2, text: 'Why is my water heater leaking from the bottom?' }] })]]),
      ga4: null, minImpressions: 5,
    });
    expect(memo.thisWeek.clicks).toBe(11);
    expect(memo.changes[0].status).toBe('applied');
    expect(memo.changes[0].appliedOn).toBe('2026-10-07');
    expect(memo.changes[0].queries[0]).toEqual({ query: 'leak from bottom', atProposal: 7.4, lastWeek: 7, thisWeek: 5 });
    expect(memo.moversUp.map((m) => m.page)).toEqual(['https://x.example/b']);
    expect(memo.notes.some((n) => /GA4 not configured/.test(n))).toBe(true);
    const text = renderMemoReadme(memo, 'node scripts/monday.ts --site x.example');
    expect(text).toContain('| This week | 2026-09-28 to 2026-10-04 | 11 (+83%)');
    expect(text).toContain('| applied (2026-10-07) | 2026-10-01 | x.example/a |');
    expect(text).toContain('leak from bottom: 7.4 / 7.0 / 5.0');
    expect(text.trim().endsWith('Built by Unfayr · unfayr.com')).toBe(true);
  });

  it('writes observations back and keeps the first applied date', () => {
    const ledger: Ledger = { site: 's', entries: [entry({})] };
    applyObservations(ledger, new Map([['id1', { date: '2026-10-14', status: 'applied', contentHash: 'new', positions: { 'leak from bottom': 5 } }]]));
    applyObservations(ledger, new Map([['id1', { date: '2026-10-21', status: 'applied', contentHash: 'new', positions: { 'leak from bottom': 4 } }]]));
    expect(ledger.entries[0].status).toBe('applied');
    expect(ledger.entries[0].appliedOn).toBe('2026-10-14');
    expect(ledger.entries[0].observations).toHaveLength(2);
    // Re-running the same day replaces that day's observation instead of adding one.
    applyObservations(ledger, new Map([['id1', { date: '2026-10-21', status: 'applied', contentHash: 'new', positions: { 'leak from bottom': 4.2 } }]]));
    expect(ledger.entries[0].observations).toHaveLength(2);
  });
});

describe('ga4', () => {
  it('normalises landing paths and merges the two weeks', () => {
    expect(pathOf('/blog/post/?utm=x')).toBe('/blog/post');
    expect(pathOf('/')).toBe('/');
    const rows = mergeWeeks(
      [{ path: '/a?x=1', sessions: 10, engagedSessions: 6, keyEvents: 1 }, { path: '/a', sessions: 5, engagedSessions: 2, keyEvents: 0 }],
      [{ path: '/a', sessions: 8, engagedSessions: 4, keyEvents: 2 }, { path: '/b', sessions: 3, engagedSessions: 1, keyEvents: 0 }],
    );
    expect(rows[0]).toEqual({ path: '/a', sessionsThis: 15, sessionsLast: 8, engagedThis: 8, engagedLast: 4, keyEventsThis: 1, keyEventsLast: 2 });
    expect(rows[1].path).toBe('/b');
  });
});
