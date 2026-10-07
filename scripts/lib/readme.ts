import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiCheckFile, CandidatesFile, PageExtract } from './types.ts';

export const CREDIT = 'Built by bttrly, bttrly.com';

/** The cell Claude replaces with a one-line diagnosis for each page. */
export const PENDING = '_pending_';

function aiSummary(page: string, ai: AiCheckFile | null): string {
  if (!ai) return 'not run';
  const rs = ai.results.filter((r) => r.page === page);
  if (rs.length === 0) return ai.skippedReason ? 'skipped' : 'none asked';
  const you = rs.filter((r) => r.onSite).length;
  const comp = rs.filter((r) => !r.onSite && r.competitors.length > 0).length;
  const parts = [`${you}/${rs.length} cite you`];
  if (comp) parts.push(`${comp} cite only competitors`);
  return parts.join(', ');
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function renderRunReadme(candidates: CandidatesFile, ai: AiCheckFile | null, extracts: Map<string, PageExtract>, opts: { runCommand: string; date: string }): string {
  const lines: string[] = [];
  lines.push(`# /find run: ${candidates.site}, ${opts.date}`);
  lines.push('');
  lines.push(`Window ${candidates.window.start} to ${candidates.window.end}, compared with ${candidates.priorWindow.start} to ${candidates.priorWindow.end}.`);
  lines.push(`${fmt(candidates.totalQueries)} queries seen, ${fmt(candidates.brandQueries)} of them brand. ${candidates.pages.length} pages worth editing, ranked below by the clicks they would gain at position 3.`);
  lines.push('');
  lines.push('| # | Page | Clicks to gain | Top query | Pos. | Impr. | AI answers | Page | What to do |');
  lines.push('|--:|------|---------------:|-----------|-----:|------:|------------|------|------------|');
  candidates.pages.forEach((p, i) => {
    const top = p.queries.find((q) => !q.brand) ?? p.queries[0];
    const ex = extracts.get(p.page);
    const status = ex ? ex.status : 'not fetched';
    const flags = p.newPage.length ? `, ${p.newPage.length} new-page` : '';
    lines.push(
      `| ${i + 1} | [${p.slug}](${p.slug}.md) | ${fmt(p.score)} | ${top.query} | ${top.position.toFixed(1)} | ${fmt(top.impressions)} | ${aiSummary(p.page, ai)} | ${status}${flags} | ${PENDING} |`,
    );
  });
  lines.push('');
  lines.push('Clicks to gain is impressions times the CTR gap between the current position and position 3, summed over the page\'s qualifying queries, for 28 days.');
  lines.push('');

  lines.push('## Skipped');
  lines.push('');
  const skipped = [...candidates.skipped];
  if (ai?.skippedReason) skipped.push(`AI answer check: ${ai.skippedReason}${ai.skipped ? ` (${ai.skipped} questions not asked)` : ''}`);
  const failed = [...extracts.values()].filter((e) => e.status === 'failed');
  for (const f of failed) skipped.push(`Page fetch failed for ${f.url}: ${f.error ?? 'unknown error'}. Its file is written from Search Console data alone.`);
  const thin = [...extracts.values()].filter((e) => e.status === 'thin');
  for (const t of thin) skipped.push(`${t.url} returned very little text (${t.wordCount} words); if it renders with JavaScript, the diagnosis is based on the queries only.`);
  if (skipped.length === 0) lines.push('Nothing skipped.');
  for (const s of skipped) lines.push(`- ${s}`);
  lines.push('');

  lines.push('## Run again');
  lines.push('');
  lines.push('Search Console data for the same date range is cached, so re-running today is instant. Tomorrow pulls fresh data.');
  lines.push('');
  lines.push('```');
  lines.push(opts.runCommand);
  lines.push('```');
  lines.push('');
  lines.push('Every change proposed in these files is recorded in `ledger.json` with the page\'s content hash, so a later `/monday` can report what changed and what moved.');
  lines.push('');
  lines.push(CREDIT);
  lines.push('');
  return lines.join('\n');
}

export function writeRunReadme(runDir: string, candidates: CandidatesFile, ai: AiCheckFile | null, extracts: Map<string, PageExtract>, opts: { runCommand: string; date: string }): string {
  const text = renderRunReadme(candidates, ai, extracts, opts);
  writeFileSync(join(runDir, 'README.md'), text);
  return text;
}
