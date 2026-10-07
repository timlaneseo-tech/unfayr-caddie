import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { entryId, recordRun, runDateFromDir, validateChanges } from '../scripts/lib/ledger.ts';
import type { CandidatesFile, PageExtract } from '../scripts/lib/types.ts';

const tmp: string[] = [];
afterEach(() => {
  for (const t of tmp.splice(0)) rmSync(t, { recursive: true, force: true });
});

function makeRun(): { site: string; run: string } {
  const site = mkdtempSync(join(tmpdir(), 'caddie-ledger-'));
  tmp.push(site);
  const run = join(site, 'runs', '2026-10-07', 'find');
  mkdirSync(join(run, 'pages'), { recursive: true });
  const candidates: CandidatesFile = {
    site: 'sc-domain:x.example',
    generatedAt: '',
    window: { start: '2026-09-07', end: '2026-10-04' },
    priorWindow: { start: '2026-08-10', end: '2026-09-06' },
    minImpressions: 20,
    totalQueries: 2,
    brandQueries: 0,
    skipped: [],
    pages: [
      {
        page: 'https://x.example/leak',
        slug: 'leak',
        score: 10,
        impressions: 300,
        clicks: 5,
        newPage: [],
        queries: [
          { query: 'leak from bottom', page: 'https://x.example/leak', clicks: 3, impressions: 200, ctr: 0.015, position: 7.4, prior: null, brand: false, isQuestion: false, score: 6 },
          { query: 'leak from top', page: 'https://x.example/leak', clicks: 2, impressions: 100, ctr: 0.02, position: 8.1, prior: null, brand: false, isQuestion: false, score: 4 },
        ],
      },
    ],
  };
  writeFileSync(join(run, 'candidates.json'), JSON.stringify(candidates));
  const extract: Partial<PageExtract> = { url: 'https://x.example/leak', contentHash: 'hash123', status: 'ok' };
  writeFileSync(join(run, 'pages', 'leak.json'), JSON.stringify(extract));
  writeFileSync(
    join(run, 'changes.json'),
    JSON.stringify([
      { page: 'https://x.example/leak', kind: 'h2', queries: ['leak from bottom'], summary: 'Add H2 "Why is my water heater leaking from the bottom?"' },
      { page: 'https://x.example/leak', kind: 'answer', queries: ['leak from bottom', 'leak from top'], summary: 'Answer-first paragraph under the new H2' },
      { page: 'https://x.example/other', kind: 'new-page', queries: ['sewer line cost'], summary: 'Brief for a sewer line replacement cost page' },
    ]),
  );
  return { site, run };
}

describe('ledger', () => {
  it('records a run once, fills hash and positions, and ignores a repeat', () => {
    const { site, run } = makeRun();
    const first = recordRun(site, run);
    expect(first).toEqual({ added: 3, replaced: 0, total: 3 });
    const second = recordRun(site, run);
    expect(second).toEqual({ added: 3, replaced: 3, total: 3 });

    // Editing a summary the same day updates the entry instead of adding a twin.
    const changesFile = join(run, 'changes.json');
    const edited = JSON.parse(readFileSync(changesFile, 'utf8')) as { summary: string }[];
    edited[0].summary = 'Add H2 "Why is my water heater leaking from the bottom?" (reworded)';
    writeFileSync(changesFile, JSON.stringify(edited));
    const third = recordRun(site, run);
    expect(third.total).toBe(3);
    expect(JSON.parse(readFileSync(join(site, 'ledger.json'), 'utf8')).entries[0].summary).toMatch(/reworded/);
    writeFileSync(changesFile, JSON.stringify(edited.map((e, i) => (i === 0 ? { ...e, summary: 'Add H2 "Why is my water heater leaking from the bottom?"' } : e))));
    recordRun(site, run);

    const ledger = JSON.parse(readFileSync(join(site, 'ledger.json'), 'utf8'));
    expect(ledger.site).toBe('sc-domain:x.example');
    const [h2, answer, newPage] = ledger.entries;
    expect(h2.contentHash).toBe('hash123');
    expect(h2.positionAtTime).toBe(7.4);
    expect(h2.impressionsAtTime).toBe(200);
    expect(answer.positionAtTime).toBe(7.4);
    expect(answer.impressionsAtTime).toBe(300);
    expect(newPage.contentHash).toBeNull();
    expect(newPage.positionAtTime).toBeNull();
    expect(h2.date).toBe('2026-10-07');
    expect(h2.run).toBe('runs/2026-10-07/find');
    expect(h2.status).toBe('proposed');
    expect(h2.id).toHaveLength(12);
  });

  it('records a /gaps run from questions.json when there is no candidates.json', () => {
    const site = mkdtempSync(join(tmpdir(), 'caddie-ledger-gaps-'));
    tmp.push(site);
    const run = join(site, 'runs', '2026-10-07', 'gaps');
    mkdirSync(run, { recursive: true });
    writeFileSync(
      join(run, 'questions.json'),
      JSON.stringify({ site: 'sc-domain:x.example', generatedAt: '', window: { start: 'a', end: 'b' }, skipped: [], questions: [{ question: 'Does drano damage pipes?', source: 'search-console', query: 'does drano damage pipes', impressions: 624, position: 10.3, rankingPage: 'https://x.example/drain', variants: [] }] }),
    );
    writeFileSync(join(run, 'changes.json'), JSON.stringify([{ page: 'https://x.example/drain', kind: 'new-page', queries: ['does drano damage pipes'], summary: 'New page: Does Drano Damage Pipes?' }]));
    const r = recordRun(site, run);
    expect(r.added).toBe(1);
    const ledger = JSON.parse(readFileSync(join(site, 'ledger.json'), 'utf8'));
    expect(ledger.entries[0].positionAtTime).toBe(10.3);
    expect(ledger.entries[0].impressionsAtTime).toBe(624);
    expect(ledger.entries[0].run).toBe('runs/2026-10-07/gaps');
  });

  it('rejects malformed changes with the entry index', () => {
    expect(() => validateChanges([{ page: 'u', kind: 'banner', queries: [], summary: 's' }])).toThrow(/entry 0: "kind"/);
    expect(() => validateChanges([{ page: 'u', kind: 'title', queries: ['q'], summary: 's' }, { page: '', kind: 'title', queries: [], summary: 's' }])).toThrow(/entry 1: "page"/);
    expect(() => validateChanges({})).toThrow(/array/);
  });

  it('derives the date from the run folder and ids deterministically', () => {
    expect(runDateFromDir('C:\\w\\sites\\x\\runs\\2026-10-07\\find')).toBe('2026-10-07');
    expect(runDateFromDir('/w/sites/x/runs/2026-10-07/find')).toBe('2026-10-07');
    const a = entryId({ page: 'p', kind: 'h2', date: '2026-10-07', summary: 's' });
    expect(a).toBe(entryId({ page: 'p', kind: 'h2', date: '2026-10-07', summary: 's' }));
    expect(a).not.toBe(entryId({ page: 'p', kind: 'h2', date: '2026-10-08', summary: 's' }));
  });
});
