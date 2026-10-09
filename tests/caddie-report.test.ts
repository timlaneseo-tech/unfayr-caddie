import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lead, renderCaddieReport } from '../scripts/lib/caddie-report.ts';
import { loadReportData } from '../scripts/lib/report-data.ts';
import { buildCaddieReport, findBrowser, pdfPageCount } from '../scripts/report.ts';

const EXAMPLE = join(import.meta.dirname, '..', 'docs', 'example-run', 'summitplumbing.example');
const tmp: string[] = [];
afterEach(() => {
  for (const t of tmp.splice(0)) rmSync(t, { recursive: true, force: true });
});
function copy(parts: string[] = ['find', 'gaps', 'monday']): string {
  const site = mkdtempSync(join(tmpdir(), 'caddie-cr-'));
  tmp.push(site);
  cpSync(join(EXAMPLE, 'config.json'), join(site, 'config.json'));
  for (const p of parts) cpSync(join(EXAMPLE, 'runs', '2026-10-07', p), join(site, 'runs', '2026-10-07', p), { recursive: true });
  return site;
}

describe('lead', () => {
  it('keeps the opening sentences, and is not fooled by decimals or quotes', () => {
    const why = 'The page slid from 5.3 to 9.0 this month. It says "Doosan" nowhere. The rest is detail.';
    expect(lead(why)).toBe('The page slid from 5.3 to 9.0 this month. It says "Doosan" nowhere.');
    expect(lead('One sentence only.')).toBe('One sentence only.');
    expect(lead(Array(80).fill('word').join(' ') + '.', 2, 10)).toBe(`${Array(10).fill('word').join(' ')}…`);
  });
});

describe('combined Caddie report', () => {
  it('leads with the top five moves in click order and links every section from the contents', () => {
    const d = loadReportData(copy(), '2026-10-07');
    const html = renderCaddieReport(d);
    expect(html).toContain('Your top 5 moves this week');
    const top = d.find?.pages.slice(0, 5) ?? [];
    const positions = top.map((p) => html.indexOf(`id="move-${p.slug}"`));
    expect(positions.every((x) => x > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const linked = [...html.matchAll(/<a href="#([a-z-]+)"/g)].map((m) => m[1]);
    for (const id of ['site', 'top-fixes', 'checklist', 'new-pages', 'checked', 'next']) {
      expect(linked).toContain(id);
      expect(html).toContain(`id="${id}"`);
    }
    for (const p of d.find?.pages.slice(5) ?? []) expect(html).toContain(`id="check-${p.slug}"`);
    for (const b of d.gaps?.briefs ?? []) expect(html).toContain((b.title.charAt(0).toUpperCase() + b.title.slice(1)).replace(/"/g, '&quot;'));
    expect(html).toContain('Implementation Pack - summitplumbing.example - 2026-10-07.pdf');
    expect(html).toContain('Built by Unfayr · unfayr.com');
  });

  it('leaves out the sections, and their contents entries, for runs that did not happen', () => {
    const html = renderCaddieReport(loadReportData(copy(['find']), '2026-10-07'));
    expect(html).not.toContain('id="site"');
    expect(html).not.toContain('href="#site"');
    expect(html).not.toContain('id="new-pages"');
    expect(html).not.toContain('href="#new-pages"');
    expect(html).toContain('id="top-fixes"');
  });

  it.runIf(!!findBrowser())('prints to at most 10 pages, with bookmarks', () => {
    const site = copy();
    const out = buildCaddieReport(site, '2026-10-07', { pdf: true });
    expect(out.pdf && existsSync(out.pdf)).toBe(true);
    const pdf = readFileSync(out.pdf as string);
    expect(pdfPageCount(pdf)).toBeLessThanOrEqual(10);
    expect(pdf.includes('/Outlines')).toBe(true);
  }, 120_000);
});
