import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAiCheck } from '../scripts/ai-check.ts';
import { defaultConfig } from '../scripts/lib/config.ts';
import { canSpend, loadUsage, parseGrounding, resolveCitations, saveUsage, type GroundedResponse } from '../scripts/lib/grounding.ts';
import type { CandidatesFile } from '../scripts/lib/types.ts';

const redirect = (title: string) => ({
  web: { uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${title.replace(/\W/g, '')}`, title },
});

describe('parseGrounding', () => {
  it('handles an answer with no grounding metadata', () => {
    const r = parseGrounding({ text: 'From memory.' }, 'summitplumbing.example');
    expect(r).toEqual({ answer: 'From memory.', cited: [], onSite: false, competitors: [] });
  });

  it('reads hosts from redirect titles and spots the site among them', () => {
    const resp: GroundedResponse = {
      text: 'Answer.',
      candidates: [{ groundingMetadata: { groundingChunks: [redirect('familyhandyman.com'), redirect('summitplumbing.example'), redirect('www.homedepot.com')] } }],
    };
    const r = parseGrounding(resp, 'summitplumbing.example');
    expect(r.onSite).toBe(true);
    expect(r.competitors).toEqual(['familyhandyman.com', 'homedepot.com']);
    expect(r.cited).toHaveLength(3);
  });

  it('uses the real host for non-redirect URIs and dedupes', () => {
    const chunk = { web: { uri: 'https://www.angi.com/articles/x', title: 'How much does a plumber cost' } };
    const r = parseGrounding({ text: 'x', candidates: [{ groundingMetadata: { groundingChunks: [chunk, chunk] } }] }, 'summitplumbing.example');
    expect(r.cited).toHaveLength(1);
    expect(r.competitors).toEqual(['angi.com']);
    expect(r.onSite).toBe(false);
  });

  it('treats a subdomain of the site as on site', () => {
    const r = parseGrounding({ text: 'x', candidates: [{ groundingMetadata: { groundingChunks: [redirect('blog.slotwise.example')] } }] }, 'slotwise.example');
    expect(r.onSite).toBe(true);
    expect(r.competitors).toEqual([]);
  });
});

describe('resolveCitations', () => {
  it('follows redirect Location headers and leaves failures alone', async () => {
    const parsed = parseGrounding(
      { text: 'x', candidates: [{ groundingMetadata: { groundingChunks: [redirect('competitor.com'), redirect('summitplumbing.example')] } }] },
      'summitplumbing.example',
    );
    const fakeFetch = (async (url: string) => {
      if (url.includes('competitorcom')) return new Response(null, { status: 302, headers: { location: 'https://www.competitor.com/guide' } });
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const r = await resolveCitations(parsed, 'summitplumbing.example', fakeFetch);
    expect(r.cited[0].url).toBe('https://www.competitor.com/guide');
    expect(r.cited[0].host).toBe('competitor.com');
    expect(r.cited[1].host).toBe('summitplumbing.example');
    expect(r.onSite).toBe(true);
  });
});

describe('usage cap', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caddie-usage-'));
    process.env.CADDIE_CONFIG_DIR = dir;
  });
  afterEach(() => {
    delete process.env.CADDIE_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts within the day and resets across days', () => {
    expect(canSpend({ date: '2026-10-07', count: 1000 }, 1000, '2026-10-07')).toBe(false);
    expect(canSpend({ date: '2026-10-06', count: 1000 }, 1000, '2026-10-07')).toBe(true);
    expect(canSpend({ date: '2026-10-07', count: 999 }, 1000, '2026-10-07')).toBe(true);
    saveUsage({ date: '2026-10-07', count: 5 });
    expect(loadUsage('2026-10-07')).toEqual({ date: '2026-10-07', count: 5 });
    expect(loadUsage('2026-10-08')).toEqual({ date: '2026-10-08', count: 0 });
  });

  it('runAiCheck stops at the cap and reports the skipped count', async () => {
    const cfg = { ...defaultConfig('sc-domain:x.example'), ai: { model: 'm', dailyCap: 2 } };
    const candidates = {
      pages: [
        { page: 'https://x.example/a', queries: [{ query: 'q1', brand: false }, { query: 'q2', brand: false }, { query: 'brand x', brand: true }, { query: 'q3', brand: false }] },
        { page: 'https://x.example/b', queries: [{ query: 'q4', brand: false }] },
      ],
    } as unknown as CandidatesFile;
    const asked: string[] = [];
    const file = await runAiCheck(cfg, candidates, async (_m, prompt) => {
      asked.push(prompt);
      return { text: 'ok' };
    }, { resolve: false });
    expect(asked).toHaveLength(2);
    expect(file.results.map((r) => r.query)).toEqual(['q1', 'q2']);
    expect(file.skipped).toBe(2);
    expect(file.skippedReason).toMatch(/Daily cap of 2/);
    expect(loadUsage().count).toBe(2);
  });

  it('runAiCheck stops after one model-unavailable error and names the fix', async () => {
    const cfg = { ...defaultConfig('sc-domain:x.example'), ai: { model: 'gemini-2.5-flash', dailyCap: 100 } };
    const candidates = { pages: [{ page: 'p', queries: [{ query: 'q1', brand: false }, { query: 'q2', brand: false }, { query: 'q3', brand: false }] }] } as unknown as CandidatesFile;
    let calls = 0;
    const file = await runAiCheck(cfg, candidates, async () => {
      calls++;
      throw Object.assign(new Error('{"error":{"code":404,"message":"This model models/gemini-2.5-flash is no longer available to new users.","status":"NOT_FOUND"}}'), { status: 404 });
    }, { resolve: false });
    expect(calls).toBe(1);
    expect(file.results).toHaveLength(0);
    expect(file.skipped).toBe(3);
    expect(file.skippedReason).toMatch(/gemini-2.5-flash.*not available.*gemini-3.8-flash/);
  });

  it('runAiCheck explains a 402 as a billing problem, not a daily quota', async () => {
    const cfg = { ...defaultConfig('sc-domain:x.example'), ai: { model: 'm', dailyCap: 100 } };
    const candidates = { pages: [{ page: 'p', queries: [{ query: 'q1', brand: false }, { query: 'q2', brand: false }] }] } as unknown as CandidatesFile;
    const file = await runAiCheck(cfg, candidates, async () => {
      throw Object.assign(new Error('{"error":{"code":402,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}'), { status: 402 });
    }, { resolve: false });
    expect(file.skipped).toBe(2);
    expect(file.skippedReason).toMatch(/402.*free tier/);
    expect(file.skippedReason).not.toMatch(/run again tomorrow/);
  });

  it('runAiCheck spaces calls out and retries once after a per-minute limit', async () => {
    const cfg = { ...defaultConfig('sc-domain:x.example'), ai: { model: 'm', dailyCap: 100 } };
    const candidates = { pages: [{ page: 'p', queries: [{ query: 'q1', brand: false }, { query: 'q2', brand: false }] }] } as unknown as CandidatesFile;
    const sleeps: number[] = [];
    let calls = 0;
    const file = await runAiCheck(
      cfg,
      candidates,
      async () => {
        calls++;
        if (calls === 2) throw Object.assign(new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for metric generate_content_free_tier_requests, limit: GenerateRequestsPerMinutePerProjectPerModel'), { status: 429 });
        return { text: 'ok' };
      },
      { resolve: false, sleep: async (ms) => void sleeps.push(ms), minIntervalMs: 4500 },
    );
    expect(calls).toBe(3);
    expect(file.results).toHaveLength(2);
    expect(file.skipped).toBe(0);
    expect(sleeps).toContain(61_000);
    expect(sleeps.some((ms) => ms > 0 && ms <= 4500)).toBe(true);
  });

  it('runAiCheck stops politely on a quota error', async () => {
    const cfg = { ...defaultConfig('sc-domain:x.example'), ai: { model: 'm', dailyCap: 100 } };
    const candidates = { pages: [{ page: 'p', queries: [{ query: 'q1', brand: false }, { query: 'q2', brand: false }] }] } as unknown as CandidatesFile;
    const file = await runAiCheck(cfg, candidates, async () => {
      throw Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { status: 429 });
    }, { resolve: false });
    expect(file.results).toHaveLength(0);
    expect(file.skipped).toBe(2);
    expect(file.skippedReason).toMatch(/quota/i);
  });
});
