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
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, flagString } from './lib/args.ts';
import { extract, failedExtract } from './lib/extract.ts';
import { FIXTURES_DIR } from './lib/fixtures.ts';
import type { CandidatesFile, PageExtract } from './lib/types.ts';
import { slugFor } from './lib/urls.ts';

export const USER_AGENT = 'caddie/0.3 (+https://github.com/timlaneseo-tech/unfayr-caddie; fetches only the pages you asked it to look at)';

export interface CurlResult {
  status: number;
  contentType: string;
  body: string;
}

/** Fetches a URL with curl; resolves null when curl is not installed or cannot run. */
export type CurlImpl = (url: string, userAgent: string, timeoutMs: number) => Promise<CurlResult | null>;

export interface FetchOptions {
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  curlImpl?: CurlImpl;
}

const CURL_MARK = '\n__caddie_curl__';

export const curlFetch: CurlImpl = (url, userAgent, timeoutMs) =>
  new Promise((done) => {
    const args = ['-sL', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-A', userAgent, '-H', 'accept: text/html,application/xhtml+xml', '-w', `${CURL_MARK}%{http_code} %{content_type}`, url];
    execFile('curl', args, { maxBuffer: 50 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      const i = stdout ? stdout.lastIndexOf(CURL_MARK) : -1;
      if (i < 0) return done(null);
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return done(null);
      const [code, ...type] = stdout.slice(i + CURL_MARK.length).trim().split(' ');
      const status = Number(code);
      done(status ? { status, contentType: type.join(' '), body: stdout.slice(0, i) } : null);
    });
  });

interface RawResponse {
  status: number | null;
  type: string;
  body: string;
  error?: string;
}

/**
 * Some CDNs (Cloudflare on Dealer Spike sites, seen 2026-10-09) refuse Node's fetch with a
 * 403 by its TLS fingerprint while serving curl the same page, user agent unchanged. A 403
 * is therefore retried once with curl; every other status is taken as the site's answer.
 */
async function fetchRaw(url: string, opts: FetchOptions): Promise<RawResponse> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const userAgent = opts.userAgent ?? USER_AGENT;
  const f = opts.fetchImpl ?? fetch;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await f(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
    });
    if (res.status === 403) {
      clearTimeout(timer);
      const c = await (opts.curlImpl ?? curlFetch)(url, userAgent, timeoutMs);
      if (c && c.status !== 403) return { status: c.status, type: c.contentType, body: c.body };
      return { status: 403, type: '', body: '' };
    }
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, type, body: res.ok && /html|xml/i.test(type) ? await res.text() : '' };
  } catch (e) {
    const error = e instanceof Error ? (e.name === 'AbortError' ? `Timed out after ${timeoutMs / 1000}s` : e.message) : String(e);
    return { status: null, type: '', body: '', error };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<PageExtract> {
  const r = await fetchRaw(url, opts);
  if (r.status === null) return failedExtract(url, null, r.error ?? 'fetch failed');
  if (r.status < 200 || r.status > 299) return failedExtract(url, r.status, `HTTP ${r.status}`);
  if (!/html|xml/i.test(r.type)) return failedExtract(url, r.status, `Not an HTML page (content-type ${r.type || 'unknown'})`);
  const ex = extract(r.body, url);
  ex.httpStatus = r.status;
  return ex;
}

/** The page's HTML as served, for reading tags the extract does not keep (the GA4 ID). */
export async function fetchHtml(url: string, opts: FetchOptions = {}): Promise<{ status: number | null; html: string; error?: string }> {
  const r = await fetchRaw(url, opts);
  if (r.status === null) return { status: null, html: '', error: r.error };
  if (r.status < 200 || r.status > 299) return { status: r.status, html: '', error: `HTTP ${r.status}` };
  return { status: r.status, html: r.body };
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
