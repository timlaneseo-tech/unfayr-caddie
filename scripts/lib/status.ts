import type { ChangeStatus, LedgerEntry, PageExtract } from './types.ts';

/** The quoted strings in a change summary, longest last-quoted first; the new text is usually the last one. */
export function quotedPhrases(summary: string): string[] {
  const out: string[] = [];
  const re = /"([^"]{6,})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(summary))) out.push(m[1].trim());
  return out;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Everything on the page a proposed heading, title or sentence could have landed in. */
export function pageText(ex: PageExtract): string {
  return norm([ex.title ?? '', ex.metaDescription ?? '', ex.h1 ?? '', ...ex.headings.map((h) => h.text), ...ex.paragraphs, ...ex.faq.map((f) => `${f.question} ${f.answer}`)].join('\n'));
}

export interface Classification {
  status: ChangeStatus;
  detail: string;
}

/**
 * The text that would prove a change was made: `lookFor` when the writer set it, else
 * the new text in a summary written to the page-diff convention ("Title: "X"", "New H2
 * "X"", "Rename "A" to "B""). Summaries that only describe a change ("Meta: ...") have
 * nothing to look for, and such changes can only ever read as changed or unchanged.
 */
export function expectedText(entry: Pick<LedgerEntry, 'summary' | 'lookFor' | 'kind'>): string | null {
  if (entry.lookFor && entry.lookFor.trim().length >= 6) return entry.lookFor.trim();
  const s = entry.summary;
  const patterns = [/^(?:Title|H1): "([^"]+)"/, /^New H[23] "([^"]+)"/, /\bto "([^"]+)"/, /^Add(?:ed)? "([^"]+)"/];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m && m[1].trim().length >= 6) return m[1].trim();
  }
  return null;
}

/**
 * Decide what happened to a proposed change by comparing the page now with the page
 * when the change was proposed. The content hash says whether anything changed; the
 * expected text says whether the change was this one.
 */
export function classifyChange(entry: LedgerEntry, now: PageExtract): Classification {
  if (entry.kind === 'redirect') {
    // Retiring a page is applied when it no longer answers as itself.
    if (now.status === 'failed' && (now.httpStatus === 404 || now.httpStatus === 410)) return { status: 'applied', detail: `page now returns HTTP ${now.httpStatus}` };
    if (now.canonical && now.canonical.replace(/\/+$/, '') !== now.url.replace(/\/+$/, '')) return { status: 'applied', detail: `page now points at ${now.canonical}` };
    if (now.status === 'failed') return { status: 'unknown', detail: `fetch failed: ${now.error ?? 'unknown error'}` };
    return { status: 'unchanged', detail: 'page still answers as itself' };
  }
  if (now.status === 'failed') {
    if (now.httpStatus === 404 || now.httpStatus === 410) return { status: 'gone', detail: `page returns HTTP ${now.httpStatus}` };
    return { status: 'unknown', detail: `fetch failed: ${now.error ?? 'unknown error'}` };
  }
  const wanted = expectedText(entry);
  const text = pageText(now);

  if (wanted && text.includes(norm(wanted))) {
    return { status: 'applied', detail: `found "${wanted}" on the page` };
  }
  if (!entry.contentHash) {
    return { status: 'unknown', detail: wanted ? `no snapshot of the page from when this was proposed, and "${wanted}" is not on it` : 'no snapshot of the page from when this was proposed, so it cannot be compared' };
  }
  if (now.contentHash === entry.contentHash) {
    return { status: 'unchanged', detail: entry.kind === 'new-page' ? 'the ranking page is unchanged; a new page cannot be detected from here' : 'page content is identical to when this was proposed' };
  }
  if (entry.kind === 'new-page') {
    return { status: 'changed', detail: 'the ranking page changed; whether the new page exists is not checked' };
  }
  return { status: 'changed', detail: wanted ? `page changed since the proposal, but "${wanted}" is not on it` : 'page changed since the proposal; this change has no text to look for, so it cannot be confirmed either way' };
}
