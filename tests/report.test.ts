import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findBrowser, loadRun, renderReport } from '../scripts/report.ts';
import type { CandidatesFile } from '../scripts/lib/types.ts';

const tmp: string[] = [];
afterEach(() => {
  for (const t of tmp.splice(0)) rmSync(t, { recursive: true, force: true });
});

function makeRun(): string {
  const site = mkdtempSync(join(tmpdir(), 'caddie-report-'));
  tmp.push(site);
  const run = join(site, 'runs', '2026-10-07', 'find');
  mkdirSync(run, { recursive: true });
  const candidates: CandidatesFile = {
    site: 'sc-domain:x.example',
    generatedAt: '2026-10-07T12:00:00Z',
    window: { start: '2026-09-07', end: '2026-10-04' },
    priorWindow: { start: '2026-08-10', end: '2026-09-06' },
    minImpressions: 20,
    totalQueries: 300,
    brandQueries: 30,
    skipped: ['3 queries under 20 impressions in 28 days'],
    pages: [
      { page: 'https://x.example/a', slug: 'a', score: 120, impressions: 5000, clicks: 40, newPage: [], queries: [{ query: 'main query', page: 'https://x.example/a', clicks: 40, impressions: 5000, ctr: 0.008, position: 8.2, prior: null, brand: false, isQuestion: false, score: 120 }] },
      { page: 'https://x.example/b', slug: 'b', score: 50, impressions: 900, clicks: 9, newPage: [], queries: [{ query: 'second', page: 'https://x.example/b', clicks: 9, impressions: 900, ctr: 0.01, position: 11, prior: null, brand: false, isQuestion: true, score: 50 }] },
    ],
  };
  writeFileSync(join(run, 'candidates.json'), JSON.stringify(candidates));
  writeFileSync(join(run, 'ai-check.json'), JSON.stringify({ site: 'sc-domain:x.example', model: 'm', mode: 'plain', note: 'Answers are plain.', results: [{ page: 'https://x.example/a', query: 'main query', asked: 'q?', model: 'm', answer: 'x', cited: [], onSite: false, competitors: [], mentionsSite: true }], skipped: 0, skippedReason: null, usedToday: 1, dailyCap: 150 }));
  writeFileSync(join(run, 'README.md'), '| 1 | [a](a.md) | 120 | main query | 8.2 | 5,000 | 1/1 mention you | ok | Retitle it and add the answer |\n| 2 | [b](b.md) | 50 | second | 11.0 | 900 | none asked | ok | _pending_ |\n');
  writeFileSync(
    join(run, 'a.md'),
    '# Page A\n\nhttps://x.example/a\nRank 1 of 2.\n\n## Queries\n\n| Query | Position |\n|---|---:|\n| main query | 8.2 |\n\n## Why it sits here\n\nBecause.\n\n## Fixes\n\n### 1. Title\n\nBefore:\n```\nOld Title\n```\nAfter:\n```\nNew Title That Answers\n```\nWhy: better.\n\n## Verify\n\nWatch it. Movement usually shows in two to four weeks.\n\nBuilt by Unfayr · unfayr.com\n',
  );
  return run;
}

describe('report', () => {
  it('renders the scorecard, the written pages, and the credit', () => {
    const run = makeRun();
    const html = renderReport(loadRun(run));
    expect(html).toContain('Caddie read <em>300</em> queries and found <em>2</em> pages');
    expect(html).toContain('Retitle it and add the answer');
    expect(html).toContain('Not written yet');
    expect(html).toContain('1 of 1 mention you');
    expect(html).toContain('<pre class="diff before" data-label="Before"><code>Old Title');
    expect(html).toContain('<pre class="diff after" data-label="After"><code>New Title That Answers');
    expect(html).toContain('id="hole-1"');
    expect(html).not.toContain('id="hole-2"');
    expect(html).toContain('Built by Unfayr · unfayr.com');
    expect(html).toContain('Answers are plain.');
    expect(html).toContain('x.example');
    expect(html).not.toMatch(/<h1>Page A<\/h1>/);
  });

  it('finds a browser only where one exists', () => {
    expect(findBrowser({ CADDIE_BROWSER: '/definitely/not/here' }, 'linux')).toBeNull();
    const browser = findBrowser();
    if (browser) expect(browser).toMatch(/chrome|edge|chromium/i);
  });
});
