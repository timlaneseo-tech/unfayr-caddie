import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir, todayIso } from './paths.ts';
import type { AiCheckResult, Citation } from './types.ts';
import { hostOf } from './urls.ts';

/**
 * The slice of a Gemini generateContent response this module reads. Declared here
 * so tests can build one by hand and the parser does not depend on SDK classes.
 */
export interface GroundedResponse {
  text?: string;
  candidates?: {
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string; domain?: string } }[];
      webSearchQueries?: string[];
    };
  }[];
}

export type ParsedGrounding = Pick<AiCheckResult, 'answer' | 'cited' | 'onSite' | 'competitors'>;

/** Grounding chunks point at a Google redirect, not the page; the title usually carries the domain. */
export function isRedirectUri(uri: string): boolean {
  return /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//i.test(uri);
}

function hostFromTitle(title: string | undefined): string {
  if (!title) return '';
  const t = title.trim().toLowerCase();
  // Titles are usually a bare domain like "familyhandyman.com"; sometimes a page title.
  const m = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/?$/.exec(t);
  return m ? m[1] : '';
}

/**
 * Reduce a grounded answer to what the writer needs: the text, who was cited, whether
 * the user's own site was among them, and which other sites were.
 */
export function parseGrounding(resp: GroundedResponse, siteHost: string): ParsedGrounding {
  const chunks = resp.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const cited: Citation[] = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    const uri = c.web?.uri ?? '';
    if (!uri) continue;
    const host = (c.web?.domain ?? '').toLowerCase().replace(/^www\./, '') || (isRedirectUri(uri) ? hostFromTitle(c.web?.title) : hostOf(uri));
    const key = `${host}|${uri}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cited.push({ url: uri, host, title: c.web?.title ?? null });
  }
  const site = siteHost.toLowerCase().replace(/^www\./, '');
  const onSite = cited.some((c) => c.host === site || c.host.endsWith(`.${site}`));
  const competitors = [...new Set(cited.map((c) => c.host).filter((h) => h && h !== site && !h.endsWith(`.${site}`)))];
  return { answer: (resp.text ?? '').trim(), cited, onSite, competitors };
}

/**
 * Follow one hop of a grounding redirect to learn the real URL. Uses a manual redirect
 * so only the Location header is read; nothing on the destination is fetched.
 */
export async function resolveRedirect(uri: string, timeoutMs = 5000, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(uri, { method: 'HEAD', redirect: 'manual', signal: ac.signal });
    const loc = res.headers.get('location');
    return loc && /^https?:\/\//i.test(loc) ? loc : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Replace redirect URLs in citations with their destinations where that can be learned. */
export async function resolveCitations(parsed: ParsedGrounding, siteHost: string, fetchImpl: typeof fetch = fetch): Promise<ParsedGrounding> {
  const cited: Citation[] = [];
  for (const c of parsed.cited) {
    if (!isRedirectUri(c.url)) {
      cited.push(c);
      continue;
    }
    const real = await resolveRedirect(c.url, 5000, fetchImpl);
    cited.push(real ? { ...c, url: real, host: hostOf(real) || c.host } : c);
  }
  const site = siteHost.toLowerCase().replace(/^www\./, '');
  return {
    answer: parsed.answer,
    cited,
    onSite: cited.some((c) => c.host === site || c.host.endsWith(`.${site}`)),
    competitors: [...new Set(cited.map((c) => c.host).filter((h) => h && h !== site && !h.endsWith(`.${site}`)))],
  };
}

export interface Usage {
  date: string;
  count: number;
}

export function usagePath(): string {
  return join(configDir(), 'gemini-usage.json');
}

export function loadUsage(today = todayIso()): Usage {
  const p = usagePath();
  if (!existsSync(p)) return { date: today, count: 0 };
  try {
    const u = JSON.parse(readFileSync(p, 'utf8')) as Usage;
    return u.date === today ? u : { date: today, count: 0 };
  } catch {
    return { date: today, count: 0 };
  }
}

export function saveUsage(u: Usage): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(usagePath(), JSON.stringify(u));
}

/** The counter resets at midnight UTC, which is also when Google resets free-tier daily quotas. */
export function canSpend(u: Usage, cap: number, today = todayIso()): boolean {
  if (u.date !== today) return cap > 0;
  return u.count < cap;
}
