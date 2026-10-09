import type { PageExtract } from './types.ts';

/**
 * Problems that repeat across pages. They are usually one template change on the site's
 * CMS and worth more than any single page edit, so the report lists them on their own.
 */
export interface Issue {
  title: string;
  detail: string;
  count: number;
}

const MIN_SHARED = 3;
const NOT_FOUND = /\b(not found|no longer available|has already been sold|page (?:you requested )?does not exist)\b/i;

function groups(values: (string | null)[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
}

export function sitewideIssues(extracts: PageExtract[]): Issue[] {
  const ok = extracts.filter((e) => e.status !== 'failed');
  const out: Issue[] = [];

  const [meta] = groups(ok.map((e) => e.metaDescription?.trim() ?? null));
  if (meta && meta[1] >= MIN_SHARED) {
    out.push({ title: `${meta[1]} pages share one meta description`, detail: `Every one of them shows searchers: "${meta[0]}" Give each page its own, or have the site template build one from the page's title.`, count: meta[1] });
  }

  const long = ok.filter((e) => (e.title?.length ?? 0) > 60);
  if (long.length >= MIN_SHARED) {
    out.push({ title: `${long.length} titles are longer than 60 characters`, detail: 'Google cuts them off in results, usually before the part that says what the page is. The site template is probably adding a long suffix to every title.', count: long.length });
  }

  const soft = ok.filter((e) => [e.h1 ?? '', ...e.headings.map((h) => h.text), ...e.paragraphs.slice(0, 3)].some((t) => NOT_FOUND.test(t)));
  if (soft.length) {
    out.push({ title: soft.length === 1 ? '1 page says "not found" but loads as a normal page' : `${soft.length} pages say "not found" but load as normal pages`, detail: 'Sold or removed items still answer as live pages, so Google keeps them in results and sends searchers to a dead end. Have the site return a 404 or 410 for them, or redirect each to its closest category.', count: soft.length });
  }

  const dupes = groups(ok.map((e) => e.title?.trim() ?? null));
  const dupCount = dupes.reduce((n, [, c]) => n + c, 0);
  if (dupes.length) {
    out.push({ title: `${dupCount} pages have the same title as another page`, detail: `For example "${dupes[0][0]}" (${dupes[0][1]} pages). Google picks one and drops the rest; give each a title that says what is different about it.`, count: dupCount });
  }
  return out;
}
