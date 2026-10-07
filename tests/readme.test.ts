import { describe, expect, it } from 'vitest';
import { CREDIT, PENDING, renderRunReadme } from '../scripts/lib/readme.ts';
import type { AiCheckFile, CandidatesFile, PageExtract } from '../scripts/lib/types.ts';

const candidates: CandidatesFile = {
  site: 'sc-domain:x.example',
  generatedAt: '',
  window: { start: '2026-09-07', end: '2026-10-04' },
  priorWindow: { start: '2026-08-10', end: '2026-09-06' },
  minImpressions: 20,
  totalQueries: 120,
  brandQueries: 4,
  skipped: ['4 brand queries kept in tables but not scored', '3 queries under 20 impressions in 28 days'],
  pages: [
    {
      page: 'https://x.example/a',
      slug: 'a',
      score: 123.4,
      impressions: 5000,
      clicks: 40,
      newPage: [{ query: 'other topic', reason: 'r' }],
      queries: [{ query: 'main query', page: 'https://x.example/a', clicks: 40, impressions: 5000, ctr: 0.008, position: 8.2, prior: null, brand: false, isQuestion: false, score: 123.4 }],
    },
    {
      page: 'https://x.example/b',
      slug: 'b',
      score: 50,
      impressions: 900,
      clicks: 9,
      newPage: [],
      queries: [{ query: 'second query', page: 'https://x.example/b', clicks: 9, impressions: 900, ctr: 0.01, position: 11, prior: null, brand: false, isQuestion: true, score: 50 }],
    },
  ],
};

const ai: AiCheckFile = {
  site: 'sc-domain:x.example',
  model: 'm',
  mode: 'grounded',
  note: null,
  skipped: 2,
  skippedReason: 'Daily cap of 1000 reached',
  usedToday: 1000,
  dailyCap: 1000,
  results: [
    { page: 'https://x.example/a', query: 'main query', asked: 'q?', model: 'm', answer: 'a', cited: [], onSite: false, competitors: ['c.com'], mentionsSite: false },
    { page: 'https://x.example/a', query: 'q2', asked: 'q?', model: 'm', answer: 'a', cited: [], onSite: true, competitors: [], mentionsSite: true },
  ],
};

const extracts = new Map<string, PageExtract>([
  ['https://x.example/b', { url: 'https://x.example/b', fetchedAt: '', status: 'failed', httpStatus: 503, error: 'HTTP 503', title: null, metaDescription: null, canonical: null, h1: null, headings: [], paragraphs: [], wordCount: 0, jsonLd: [], faq: [], contentHash: null }],
]);

describe('renderRunReadme', () => {
  it('lists every page, the skipped reasons, and ends with the credit line', () => {
    const text = renderRunReadme(candidates, ai, extracts, { runCommand: 'node scripts/find.ts --site x.example', date: '2026-10-07' });
    expect(text).toContain('| 1 | [a](a.md) | 123 | main query | 8.2 | 5,000 | 1/2 cite you, 1 cite only competitors | not fetched, 1 new-page | _pending_ |');
    expect(text).toContain('| 2 | [b](b.md) | 50 | second query | 11.0 | 900 | skipped | failed | _pending_ |');
    expect(text).toContain('- 4 brand queries kept in tables but not scored');
    expect(text).toContain('- AI answer check: Daily cap of 1000 reached (2 questions not asked)');
    expect(text).toContain('Page fetch failed for https://x.example/b: HTTP 503');
    expect(text).toContain('node scripts/find.ts --site x.example');
    expect(text.trim().endsWith(CREDIT)).toBe(true);
    expect(text.split(PENDING).length - 1).toBe(2);
  });

  it('says when the AI check was not run at all', () => {
    const text = renderRunReadme({ ...candidates, skipped: [] }, null, new Map(), { runCommand: 'x', date: '2026-10-07' });
    expect(text).toContain('| not run |');
    expect(text).toContain('Nothing skipped.');
  });
});
