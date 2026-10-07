import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../scripts/lib/config.ts';
import { buildQuestions, findSitePage, sameIntent, scoreGaps } from '../scripts/lib/gaps.ts';
import type { AiCheckFile, GscRow, PageExtract, SiteConfig } from '../scripts/lib/types.ts';

const row = (over: Partial<GscRow>): GscRow => ({ query: 'q', page: 'https://x.example/a', date: '2026-10-01', clicks: 1, impressions: 100, ctr: 0.01, position: 8, ...over });
const win = { start: '2026-09-07', end: '2026-10-04' };
const cfg: SiteConfig = {
  ...defaultConfig('sc-domain:x.example'),
  brandTerms: ['Summit Plumbing'],
  market: { topics: ['tankless water heater installation'], competitors: ['angi.com', 'homedepot.com'], audience: 'Boise homeowners' },
};

function ex(url: string, title: string, h1: string, headings: string[] = []): PageExtract {
  return { url, fetchedAt: '', status: 'ok', httpStatus: 200, title, metaDescription: null, canonical: null, h1, headings: headings.map((t) => ({ level: 2, text: t })), paragraphs: [], wordCount: 300, jsonLd: [], faq: [], contentHash: 'h' };
}

describe('sameIntent', () => {
  it('folds phrasings of one question together and keeps different ones apart', () => {
    expect(sameIntent('how long do water heaters last', 'how long does a water heater last')).toBe(true);
    expect(sameIntent('how long do water heaters last', 'how much does a water heater cost')).toBe(false);
  });
});

describe('buildQuestions', () => {
  it('takes question queries from Search Console, clusters them, adds templates and user questions, and caps', () => {
    const rows = [
      row({ query: 'how long do water heaters last', impressions: 3000, position: 4.6, page: 'https://x.example/blog/last' }),
      row({ query: 'how long does a water heater last', impressions: 2000, position: 4.8, page: 'https://x.example/blog/last' }),
      row({ query: 'is a tankless water heater worth it', impressions: 1000, position: 8.1, page: 'https://x.example/tankless' }),
      row({ query: 'water heater repair', impressions: 4000, position: 13 }),
      row({ query: 'site:x.example', impressions: 50, position: 1 }),
    ];
    const f = buildQuestions(rows, cfg, { window: win, userQuestions: ['Do you service Nampa', '# comment', ''] });
    const sc = f.questions.filter((q) => q.source === 'search-console');
    expect(sc.map((q) => q.question)).toEqual(['How long do water heaters last?', 'Is a tankless water heater worth it?']);
    expect(sc[0].variants).toEqual(['how long does a water heater last']);
    expect(sc[0].impressions).toBe(5000);
    expect(sc[0].rankingPage).toBe('https://x.example/blog/last');
    // The template "is tankless water heater installation worth it" folds into the Search Console question.
    const templates = f.questions.filter((q) => q.source === 'template');
    expect(templates.map((q) => q.question)).toContain('How much does tankless water heater installation cost?');
    expect(templates.some((q) => /worth it/.test(q.question))).toBe(false);
    expect(f.questions.find((q) => q.source === 'user')?.question).toBe('Do you service Nampa?');
    expect(f.skipped.join(' ')).toMatch(/1 Search Console questions folded/);

    const capped = buildQuestions(rows, { ...cfg, market: { ...cfg.market!, maxQuestions: 3 } }, { window: win });
    expect(capped.questions).toHaveLength(3);
    expect(capped.questions[0].source).toBe('search-console');
    expect(capped.skipped.join(' ')).toMatch(/beyond the cap of 3/);
  });

  it('says so when there is no market block', () => {
    const f = buildQuestions([], { ...cfg, market: undefined }, { window: win });
    expect(f.skipped.join(' ')).toMatch(/No market.topics/);
  });
});

describe('findSitePage and scoreGaps', () => {
  const extracts = new Map<string, PageExtract>([
    ['https://x.example/blog/last', ex('https://x.example/blog/last', 'How Long Do Water Heaters Last? | Summit', 'How Long Do Water Heaters Last?')],
    ['https://x.example/drain', ex('https://x.example/drain', 'Drain Cleaning | Summit', 'Drain Cleaning Services', ['How We Clear Drains'])],
  ]);

  it('matches a question to a page that is about it, not one that merely ranks', () => {
    const f = buildQuestions(
      [row({ query: 'how long do water heaters last', impressions: 3000, position: 4.6, page: 'https://x.example/blog/last' }), row({ query: 'does drano damage pipes', impressions: 600, position: 10, page: 'https://x.example/drain' })],
      cfg,
      { window: win },
    );
    expect(findSitePage(f.questions[0], extracts)).toBe('https://x.example/blog/last');
    expect(findSitePage(f.questions[1], extracts)).toBeNull();
  });

  it('counts a question as covered on the page alone when there is no AI answer', () => {
    const f = buildQuestions([row({ query: 'how long do water heaters last', impressions: 3000, position: 4.6, page: 'https://x.example/blog/last' })], { ...cfg, market: { ...cfg.market!, topics: [] } }, { window: win });
    const { gaps, covered } = scoreGaps(f, null, extracts, cfg);
    expect(covered).toHaveLength(1);
    expect(gaps).toHaveLength(0);
    expect(covered[0].signals).toEqual(['covered: the site has a page about it']);
  });

  it('ranks open questions above covered ones and explains why', () => {
    const f = buildQuestions(
      [row({ query: 'how long do water heaters last', impressions: 3000, position: 4.6, page: 'https://x.example/blog/last' }), row({ query: 'does drano damage pipes', impressions: 600, position: 10, page: 'https://x.example/drain' })],
      { ...cfg, market: { ...cfg.market!, topics: [] } },
      { window: win },
    );
    const ai: AiCheckFile = {
      site: 's', model: 'm', mode: 'plain', note: null, skipped: 0, skippedReason: null, usedToday: 2, dailyCap: 150,
      results: [
        { page: '', query: 'how long do water heaters last', asked: 'How long do water heaters last?', model: 'm', answer: 'About 8 to 12 years, says Summit Plumbing.', cited: [], onSite: false, competitors: [], mentionsSite: true },
        { page: '', query: 'does drano damage pipes', asked: 'Does drano damage pipes?', model: 'm', answer: 'Home Depot says repeated use can damage older pipes.', cited: [], onSite: false, competitors: [], mentionsSite: false },
      ],
    };
    const { gaps, covered } = scoreGaps(f, ai, extracts, cfg);
    expect(covered.map((c) => c.question.question)).toEqual(['How long do water heaters last?']);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].question.question).toBe('Does drano damage pipes?');
    expect(gaps[0].signals).toEqual(['ranks at 10 on a page that is not about it', 'AI answer does not mention the site', 'AI answer names homedepot.com']);
    expect(gaps[0].score).toBeGreaterThan(40);
  });
});
