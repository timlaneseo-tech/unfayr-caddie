import { createHash } from 'node:crypto';
import { parse, type HTMLElement } from 'node-html-parser';
import type { PageExtract } from './types.ts';

/** Pages under this many words are marked thin: there is little to diagnose from the copy itself. */
export const THIN_WORDS = 120;

function clean(s: string | undefined | null): string | null {
  if (s == null) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
}

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * A paragraph someone wrote, as opposed to a card, a spec row or a menu item. Inventory
 * cards render their labels glued to the values ("LocationGrimes ConditionPre-Owned
 * MakeDevelon"), and a card whose notes field holds a sentence would otherwise pass;
 * prose has at most a name or two with an inner capital (McKinnon, YouTube).
 */
export function isProse(p: string): boolean {
  const glued = p.split(/\s+/).filter((w) => /[a-z][A-Z]/.test(w)).length;
  return words(p) >= 12 && glued < 3 && /[.!?]["')]?(\s|$)/.test(p);
}

/**
 * The hash covers the prose: title, H1, H2s and sentence-bearing paragraphs. Featured
 * inventory cards, related-post lists and other blocks that rotate on every load would
 * otherwise make every page read as "changed" the week after a suggestion. It takes an
 * extract's own fields so a saved extract can be rehashed when this rule changes.
 */
export function contentHashOf(ex: Pick<PageExtract, 'title' | 'h1' | 'headings' | 'paragraphs'>): string | null {
  const prose = ex.paragraphs.filter((p) => isProse(p));
  const hashInput = [ex.title ?? '', ex.h1 ?? '', ...ex.headings.filter((h) => h.level <= 2).map((h) => h.text), ...(prose.length ? prose : ex.paragraphs)]
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return hashInput.trim() ? createHash('sha256').update(hashInput).digest('hex') : null;
}

interface FaqItem {
  question: string;
  answer: string;
}

function faqFromJsonLd(items: unknown[]): FaqItem[] {
  const out: FaqItem[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const o = node as Record<string, unknown>;
    const type = o['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.includes('FAQPage') && Array.isArray(o.mainEntity)) {
      for (const q of o.mainEntity as Record<string, unknown>[]) {
        const name = clean(typeof q.name === 'string' ? q.name : null);
        const acc = q.acceptedAnswer as Record<string, unknown> | undefined;
        const text = clean(typeof acc?.text === 'string' ? (acc.text as string) : null);
        if (name && text) out.push({ question: name, answer: parse(text).text.replace(/\s+/g, ' ').trim() });
      }
    }
    if (Array.isArray(o['@graph'])) visit(o['@graph']);
  };
  visit(items);
  return out;
}

function faqFromDetails(root: HTMLElement): FaqItem[] {
  const out: FaqItem[] = [];
  for (const d of root.querySelectorAll('details')) {
    const q = clean(d.querySelector('summary')?.text);
    const body = d.querySelectorAll('p').map((p) => p.text).join(' ');
    const a = clean(body) ?? clean(d.text.replace(q ?? '', ''));
    if (q && a) out.push({ question: q, answer: a });
  }
  return out;
}

/**
 * Pull the parts of a page the writer needs. Navigation, footers, scripts and
 * sidebars are removed first so "paragraph six" means the sixth paragraph a
 * reader sees, not the sixth string in the DOM.
 */
export function extract(html: string, url: string, fetchedAt: string = new Date().toISOString()): PageExtract {
  const root = parse(html, { blockTextElements: { script: true, style: true, noscript: true, pre: true } });

  const title = clean(root.querySelector('title')?.text);
  const metaDescription = clean(root.querySelector('meta[name="description" i]')?.getAttribute('content'));
  const canonical = clean(root.querySelector('link[rel="canonical" i]')?.getAttribute('href'));

  const jsonLd: unknown[] = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json" i]')) {
    try {
      jsonLd.push(JSON.parse(s.rawText.trim()));
    } catch {
      // Broken JSON-LD is common in the wild; skip it rather than fail the page.
    }
  }

  for (const sel of ['script', 'style', 'noscript', 'template', 'svg', 'nav', 'header', 'footer', 'aside', 'form', '[role="navigation"]', '[aria-hidden="true"]']) {
    for (const el of root.querySelectorAll(sel)) el.remove();
  }

  const scope = root.querySelector('main') ?? root.querySelector('article') ?? root.querySelector('body') ?? root;
  const h1 = clean(scope.querySelector('h1')?.text) ?? clean(root.querySelector('h1')?.text);

  const headings = scope
    .querySelectorAll('h1, h2, h3, h4')
    .map((h) => ({ level: Number(h.tagName.slice(1)), text: clean(h.text) }))
    .filter((h): h is { level: number; text: string } => h.text !== null);

  // Dealer and e-commerce templates often put spec lists and descriptions in a div
  // with <br> separators instead of <p>. A div whose element children are only
  // line breaks and inline formatting is a paragraph in all but name.
  const INLINE = new Set(['BR', 'B', 'STRONG', 'EM', 'I', 'SPAN', 'A', 'SMALL', 'SUP', 'SUB']);
  const divParagraphs = scope
    .querySelectorAll('div, dd, dt, th, figcaption')
    .filter((d) => d.childNodes.length > 0 && d.childNodes.every((n) => n.nodeType === 3 || (n.nodeType === 1 && INLINE.has((n as HTMLElement).tagName))))
    .map((d) => clean(d.text))
    .filter((t): t is string => t !== null && t.length >= 40);

  const paragraphs = [
    ...scope
      .querySelectorAll('p, li, blockquote, td')
      .map((p) => clean(p.text))
      .filter((t): t is string => t !== null && t.length >= 20),
    ...divParagraphs,
  ].filter((t, i, all) => all.indexOf(t) === i);

  const faq = [...faqFromJsonLd(jsonLd), ...faqFromDetails(scope)];
  const wordCount = paragraphs.reduce((n, p) => n + words(p), 0) + headings.reduce((n, h) => n + words(h.text), 0);

  const contentHash = contentHashOf({ title, h1, headings, paragraphs });

  const thin = wordCount < THIN_WORDS || (!h1 && paragraphs.length === 0);
  return {
    url,
    fetchedAt,
    status: thin ? 'thin' : 'ok',
    httpStatus: 200,
    title,
    metaDescription,
    canonical,
    h1,
    headings,
    paragraphs,
    wordCount,
    jsonLd,
    faq,
    contentHash,
  };
}

export function failedExtract(url: string, httpStatus: number | null, error: string, fetchedAt: string = new Date().toISOString()): PageExtract {
  return {
    url,
    fetchedAt,
    status: 'failed',
    httpStatus,
    error,
    title: null,
    metaDescription: null,
    canonical: null,
    h1: null,
    headings: [],
    paragraphs: [],
    wordCount: 0,
    jsonLd: [],
    faq: [],
    contentHash: null,
  };
}
