import { parse } from 'node-html-parser';
import { isProse } from './extract.ts';
import { isOperatorQuery } from './questions.ts';
import type { PageExtract } from './types.ts';

/**
 * Facts for the business card the guided run shows the owner: what the site says about
 * itself in structured data, titles and headings, and what people search to find it.
 * Claude drafts brand terms, locations, offerings and topics from these; the owner confirms.
 */
export interface Profile {
  names: string[];
  addresses: string[];
  phones: string[];
  brands: string[];
  titles: string[];
  headings: string[];
  /** Sentences the site wrote about itself, home page then about page. */
  prose: string[];
  topQueries: string[];
}

const BUSINESS = /Organization|LocalBusiness|Store|Dealer|Service|Corporation|Company/i;

function nodes(jsonLd: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    const o = n as Record<string, unknown>;
    out.push(o);
    if (Array.isArray(o['@graph'])) visit(o['@graph']);
  };
  visit(jsonLd);
  return out;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function address(a: unknown): string | null {
  if (typeof a === 'string') return text(a);
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const region = [text(o.addressRegion), text(o.postalCode)].filter(Boolean).join(' ');
  const parts = [text(o.streetAddress), text(o.addressLocality), region || null].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

const uniq = (xs: (string | null)[]): string[] => [...new Set(xs.filter((x): x is string => !!x))];

export function profileFacts(home: PageExtract, about: PageExtract | null, queries: { query: string; impressions: number }[]): Profile {
  const pages = [home, about].filter((p): p is PageExtract => !!p && p.status !== 'failed');
  const biz = pages.flatMap((p) => nodes(p.jsonLd)).filter((o) => BUSINESS.test(String(o['@type'] ?? '')));
  return {
    names: uniq(biz.map((o) => text(o.name))),
    addresses: uniq(biz.flatMap((o) => [o.address].flat().map(address))),
    phones: uniq(biz.map((o) => text(o.telephone))),
    brands: uniq(biz.flatMap((o) => [o.brand].flat().map((b) => (b && typeof b === 'object' ? text((b as Record<string, unknown>).name) : text(b))))),
    titles: uniq(pages.map((p) => p.title)),
    headings: uniq(pages.flatMap((p) => [p.h1, ...p.headings.filter((h) => h.level <= 3).map((h) => h.text)])).slice(0, 40),
    prose: uniq(pages.flatMap((p) => p.paragraphs.filter(isProse))).slice(0, 12),
    topQueries: [...queries].filter((q) => !isOperatorQuery(q.query)).sort((a, b) => b.impressions - a.impressions).slice(0, 40).map((q) => q.query),
  };
}

/** The first link on the same host whose path mentions "about". */
export function aboutLink(html: string, base: string): string | null {
  const host = new URL(base).hostname;
  for (const a of parse(html).querySelectorAll('a[href]')) {
    try {
      const u = new URL(a.getAttribute('href') as string, base);
      if (u.hostname === host && /about/i.test(u.pathname)) return u.href;
    } catch {
      // ignore unparseable hrefs
    }
  }
  return null;
}
