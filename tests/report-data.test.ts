import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { effortFor, loadReportData, mdSections } from '../scripts/lib/report-data.ts';
import { sitewideIssues } from '../scripts/lib/sitewide.ts';
import type { PageExtract } from '../scripts/lib/types.ts';

const EXAMPLE = join(import.meta.dirname, '..', 'docs', 'example-run', 'summitplumbing.example');
const tmp: string[] = [];
afterEach(() => {
  for (const t of tmp.splice(0)) rmSync(t, { recursive: true, force: true });
});
function copy(parts: string[] = ['find', 'gaps', 'monday']): string {
  const site = mkdtempSync(join(tmpdir(), 'caddie-rd-'));
  tmp.push(site);
  cpSync(join(EXAMPLE, 'config.json'), join(site, 'config.json'));
  for (const p of parts) cpSync(join(EXAMPLE, 'runs', '2026-10-07', p), join(site, 'runs', '2026-10-07', p), { recursive: true });
  return site;
}

describe('mdSections', () => {
  it('splits on ## headings outside code fences only', () => {
    const s = mdSections('# T\n\n## A\nx\n```\n## not a heading\n```\n## B\ny\n');
    expect(Object.keys(s)).toEqual(['A', 'B']);
    expect(s.A).toContain('## not a heading');
  });
});

describe('loadReportData', () => {
  it('reads the find, gaps and monday runs of the example site', () => {
    const d = loadReportData(copy(), '2026-10-07');
    expect(d.host).toBe('summitplumbing.example');
    const pages = d.find?.pages ?? [];
    expect(pages).toHaveLength(10);
    expect(pages.map((p) => p.clicks)).toEqual([...pages.map((p) => p.clicks)].sort((a, b) => b - a));
    for (const p of pages) {
      expect(p.oneLine.length).toBeGreaterThan(10);
      expect(p.why.length).toBeGreaterThan(40);
      expect(p.keyFixes.length).toBeGreaterThan(0);
      expect(p.keyFixes[0].after.length).toBeGreaterThan(5);
    }
    expect(pages[0].keyFixes[0]).toMatchObject({ label: 'Title' });
    expect(pages[0].keyFixes[0].before).toBeTruthy();
    expect(d.gaps?.briefs).toHaveLength(3);
    expect(d.gaps?.briefs[0].firstParagraph).toMatch(/^[A-Z]/);
    expect(d.gaps?.briefs.every((b) => b.url.startsWith('/') && b.question.endsWith('?'))).toBe(true);
    expect(d.monday?.thisWeek.clicks).toBe(427);
    expect(d.monday?.threeThings).toHaveLength(3);
  });

  it('reads a brief whose first paragraph section starts with the code fence', () => {
    const site = copy(['find']);
    const g = join(site, 'runs', '2026-10-07', 'gaps');
    mkdirSync(g, { recursive: true });
    writeFileSync(join(g, 'gaps.json'), JSON.stringify({ site: 'x', generatedAt: '', mode: 'plain', gaps: [], covered: [], skipped: [] }));
    writeFileSync(join(g, 'crane-cost.md'), '# Crane Rental Cost\n\nQuestion: How much does a crane cost?\nURL: /crane-cost\n\n## Why it is a gap\n\nNo page.\n\n## First paragraph\n\n```\nRenting a crane costs [add yours].\n```\n\n## Verify\n\nx\n');
    expect(loadReportData(site, '2026-10-07').gaps?.briefs[0].firstParagraph).toBe('Renting a crane costs [add yours].');
  });

  it('leaves out the runs that do not exist', () => {
    const d = loadReportData(copy(['find']), '2026-10-07');
    expect(d.find).not.toBeNull();
    expect(d.gaps).toBeNull();
    expect(d.monday).toBeNull();
  });
});

describe('effortFor', () => {
  it('sorts work into five minutes, half an hour, or your web provider', () => {
    expect(effortFor(['title', 'meta'], '')).toBe('5 minutes');
    expect(effortFor(['title', 'h2'], '')).toBe('About 30 minutes');
    expect(effortFor(['redirect'], '')).toBe('Ask your web provider');
    expect(effortFor(['title'], 'This is the Dealer Spike staff template')).toBe('Ask your web provider');
  });
});

describe('sitewideIssues', () => {
  const ex = (url: string, over: Partial<PageExtract>): PageExtract => ({
    url, fetchedAt: '', status: 'ok', httpStatus: 200, title: `Title ${url}`, metaDescription: `Meta ${url}`, canonical: null, h1: 'H',
    headings: [], paragraphs: [], wordCount: 300, jsonLd: [], faq: [], contentHash: null, ...over,
  });
  it('finds shared descriptions, long titles, soft 404s and duplicate titles', () => {
    const boiler = 'RTL Equipment featuring new and used Heavy Equipment.';
    const long = 'A title that is very much longer than sixty characters, for sure, yes';
    const issues = sitewideIssues([
      ex('a', { metaDescription: boiler, title: long }),
      ex('b', { metaDescription: boiler, title: long }),
      ex('c', { metaDescription: boiler, title: long }),
      ex('d', { paragraphs: ['The requested inventory is no longer available or has already been sold.'] }),
      ex('e', { status: 'failed' }),
    ]);
    const titles = issues.map((i) => i.title);
    expect(titles.some((t) => /share one meta description/.test(t))).toBe(true);
    expect(issues.find((i) => /meta description/.test(i.title))?.count).toBe(3);
    expect(titles.some((t) => /longer than 60/.test(t))).toBe(true);
    expect(titles.some((t) => /not found/i.test(t))).toBe(true);
    expect(titles).toContain('1 page says "not found" but loads as a normal page');
    expect(titles.some((t) => /same title/.test(t))).toBe(true);
    expect(sitewideIssues([ex('x', {}), ex('y', {})])).toEqual([]);
  });
});
