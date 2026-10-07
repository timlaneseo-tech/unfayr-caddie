#!/usr/bin/env node
/**
 * Fetch each candidate page and save what the writer needs as JSON.
 *
 *   node scripts/fetch-page.ts --site example.com --run sites/example.com/runs/2026-10-07/find
 *   node scripts/fetch-page.ts --sample summitplumbing.example --run <dir>   (reads fixtures/, no network)
 *
 * Only the user's own candidate pages are fetched, once each, with a user agent that
 * says who is asking. A failed fetch is recorded and the pipeline moves on.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, flagString } from './lib/args.ts';
import { extract, failedExtract } from './lib/extract.ts';
import { FIXTURES_DIR } from './lib/fixtures.ts';
import type { CandidatesFile, PageExtract } from './lib/types.ts';
import { slugFor } from './lib/urls.ts';

export const USER_AGENT = 'caddie/0.1 (+https://github.com/timlaneseo-tech/caddie; fetches only the pages you asked it to look at)';

export interface FetchOptions {
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<PageExtract> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const f = opts.fetchImpl ?? fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await f(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'user-agent': opts.userAgent ?? USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) return failedExtract(url, res.status, `HTTP ${res.status}`);
    if (!/html|xml/i.test(type)) return failedExtract(url, res.status, `Not an HTML page (content-type ${type || 'unknown'})`);
    const html = await res.text();
    const ex = extract(html, url);
    ex.httpStatus = res.status;
    return ex;
  } catch (e) {
    const msg = e instanceof Error ? (e.name === 'AbortError' ? `Timed out after ${timeoutMs / 1000}s` : e.message) : String(e);
    return failedExtract(url, null, msg);
  } finally {
    clearTimeout(timer);
  }
}

/** Sample mode: the "fetch" reads fixtures/<site>/pages/<slug>.html. Missing files behave like a failed fetch. */
export function samplePage(fixtureDomain: string, url: string): PageExtract {
  const file = join(FIXTURES_DIR, fixtureDomain, 'pages', `${slugFor(url)}.html`);
  if (!existsSync(file)) return failedExtract(url, 404, `No fixture page at ${file}`);
  return extract(readFileSync(file, 'utf8'), url);
}

export function extractsDir(run: string): string {
  return join(run, 'pages');
}

export function writeExtract(run: string, ex: PageExtract): string {
  const dir = extractsDir(run);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slugFor(ex.url)}.json`);
  writeFileSync(file, JSON.stringify(ex, null, 2));
  return file;
}

export function readExtracts(run: string, candidates: CandidatesFile): Map<string, PageExtract> {
  const out = new Map<string, PageExtract>();
  for (const p of candidates.pages) {
    const file = join(extractsDir(run), `${p.slug}.json`);
    if (existsSync(file)) out.set(p.page, JSON.parse(readFileSync(file, 'utf8')) as PageExtract);
  }
  return out;
}

export async function fetchCandidates(
  run: string,
  candidates: CandidatesFile,
  getPage: (url: string) => Promise<PageExtract>,
  log: (s: string) => void = () => {},
): Promise<Map<string, PageExtract>> {
  const out = new Map<string, PageExtract>();
  for (const p of candidates.pages) {
    const ex = await getPage(p.page);
    writeExtract(run, ex);
    out.set(p.page, ex);
    log(`${ex.status.padEnd(6)} ${p.page}${ex.error ? `  (${ex.error})` : ''}`);
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const run = flagString(args, 'run');
  if (!run) throw new Error('Usage: node scripts/fetch-page.ts --run <dir> [--sample <fixtureDomain>]');
  const candidates = JSON.parse(readFileSync(join(run, 'candidates.json'), 'utf8')) as CandidatesFile;
  const sample = flagString(args, 'sample');
  await fetchCandidates(run, candidates, async (url) => (sample ? samplePage(sample, url) : fetchPage(url)), console.log);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
