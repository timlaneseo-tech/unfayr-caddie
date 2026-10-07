import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flagNewPages, percentile, selectCandidates } from '../scripts/find-candidates.ts';
import { defaultConfig } from '../scripts/lib/config.ts';
import { FIXTURES_DIR, placeOnDates, readFixtureRows } from '../scripts/lib/fixtures.ts';
import { windows } from '../scripts/lib/gsc.ts';
import type { GscRow, PageExtract } from '../scripts/lib/types.ts';

const w = windows(new Date('2026-10-07T12:00:00Z'));
const opts = { window: w.current, priorWindow: w.prior, now: new Date('2026-10-07T12:00:00Z') };

const row = (over: Partial<GscRow>): GscRow => ({
  query: 'q',
  page: 'https://x.example/a',
  date: '2026-09-10',
  clicks: 1,
  impressions: 100,
  ctr: 0.01,
  position: 8,
  ...over,
});

function extract(url: string, title: string, h1: string): PageExtract {
  return {
    url, fetchedAt: '', status: 'ok', httpStatus: 200, title, metaDescription: null, canonical: null, h1,
    headings: [], paragraphs: [], wordCount: 500, jsonLd: [], faq: [], contentHash: 'abc',
  };
}

describe('percentile', () => {
  it('returns the nearest-rank percentile', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 80)).toBe(8);
    expect(percentile([5], 80)).toBe(5);
    expect(percentile([], 80)).toBe(0);
  });
});

describe('selectCandidates', () => {
  const cfg = defaultConfig('sc-domain:x.example');

  it('groups URL variants of one page together', () => {
    const rows = [
      row({ page: 'https://x.example/a?utm=1', impressions: 30 }),
      row({ page: 'https://x.example/a/', impressions: 30 }),
      row({ page: 'https://x.example/a#top', impressions: 30 }),
    ];
    const f = selectCandidates(rows, [], cfg, opts);
    expect(f.pages).toHaveLength(1);
    expect(f.pages[0].page).toBe('https://x.example/a');
    expect(f.pages[0].queries[0].impressions).toBe(90);
  });

  it('still returns a candidate for a tiny site by lowering the floor', () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ query: `query ${i}`, impressions: 3 + i, position: 6 }));
    const f = selectCandidates(rows, [], cfg, opts);
    expect(f.minImpressions).toBeLessThan(20);
    expect(f.pages.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps brand queries in the table with zero score and excludes them from page totals', () => {
    const rows = [
      row({ query: 'water heater repair', impressions: 500, position: 7 }),
      row({ query: 'x example reviews', impressions: 200, position: 1.1, clicks: 120 }),
    ];
    const f = selectCandidates(rows, [], { ...cfg, brandTerms: ['x example'] }, opts);
    expect(f.brandQueries).toBe(1);
    const brandStat = f.pages[0].queries.find((q) => q.brand)!;
    expect(brandStat.query).toBe('x example reviews');
    expect(brandStat.score).toBe(0);
    expect(f.pages[0].queries[0].query).toBe('water heater repair');
    expect(f.pages[0].impressions).toBe(500);
  });

  it('applies the position window inclusively', () => {
    const rows = [
      row({ query: 'in', position: 4.0, impressions: 100 }),
      row({ query: 'out-low', position: 3.9, impressions: 100 }),
      row({ query: 'edge', position: 15.0, impressions: 100 }),
      row({ query: 'out-high', position: 15.1, impressions: 100 }),
    ];
    const f = selectCandidates(rows, [], cfg, opts);
    expect(f.pages[0].queries.map((q) => q.query).sort()).toEqual(['edge', 'in']);
    expect(f.skipped.join(' ')).toMatch(/2 queries outside positions 4-15/);
  });

  it('honours the page cap and reports it', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ query: `q${i}`, page: `https://x.example/p${i}`, impressions: 100 + i }));
    const f = selectCandidates(rows, [], { ...cfg, thresholds: { ...cfg.thresholds, maxPages: 5 } }, opts);
    expect(f.pages).toHaveLength(5);
    expect(f.pages[0].impressions).toBe(129);
    expect(f.skipped.join(' ')).toMatch(/25 pages beyond the cap of 5/);
  });

  it('attaches the prior period for the same query and page', () => {
    const cur = [row({ query: 'q', impressions: 100, position: 6 })];
    const pri = [row({ query: 'q', impressions: 80, position: 9, date: '2026-08-20' })];
    const f = selectCandidates(cur, pri, cfg, opts);
    expect(f.pages[0].queries[0].prior).toEqual({ clicks: 1, impressions: 80, position: 9 });
  });

  it('ranks the fixture site sensibly', () => {
    const rows = readFixtureRows(join(FIXTURES_DIR, 'summitplumbing.example'));
    const placed = placeOnDates(rows, w.prior, w.current);
    const f = selectCandidates(placed.current, placed.prior, defaultConfig('sc-domain:summitplumbing.example'), opts);
    expect(f.totalQueries).toBeGreaterThan(250);
    expect(f.pages.length).toBeGreaterThanOrEqual(8);
    expect(f.pages.length).toBeLessThanOrEqual(25);
    expect(f.pages.slice(0, 6).map((p) => p.slug)).toContain('blog-why-is-my-water-heater-leaking');
    expect(f.pages[0].score).toBeGreaterThanOrEqual(f.pages[1].score);
    for (const p of f.pages) {
      expect(p.queries[0].score).toBeGreaterThanOrEqual(p.queries[p.queries.length - 1].score);
      expect(p.queries.every((q) => q.brand || (q.position >= 4 && q.position <= 15))).toBe(true);
    }
  });
});

describe('flagNewPages', () => {
  it('flags a high-impression query that shares no words with the page title or H1', () => {
    const cfg = defaultConfig('sc-domain:x.example');
    const rows = [
      row({ query: 'drain cleaning near me', page: 'https://x.example/drain-cleaning', impressions: 500, position: 8 }),
      row({ query: 'sewer line replacement cost', page: 'https://x.example/drain-cleaning', impressions: 300, position: 10 }),
      row({ query: 'tiny unrelated thing', page: 'https://x.example/drain-cleaning', impressions: 25, position: 10 }),
    ];
    const f = selectCandidates(rows, [], cfg, opts);
    const extracts = new Map([[f.pages[0].page, extract(f.pages[0].page, 'Drain Cleaning | X', 'Drain Cleaning Services')]]);
    flagNewPages(f, extracts);
    expect(f.pages[0].newPage.map((n) => n.query)).toEqual(['sewer line replacement cost']);
  });

  it('falls back to URL words when the page has no title', () => {
    const cfg = defaultConfig('sc-domain:x.example');
    const rows = [row({ query: 'water heater repair cost', page: 'https://x.example/water-heater-repair', impressions: 500, position: 8 })];
    const f = selectCandidates(rows, [], cfg, opts);
    flagNewPages(f, new Map());
    expect(f.pages[0].newPage).toEqual([]);
  });
});
