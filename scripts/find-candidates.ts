#!/usr/bin/env node
/**
 * Turn two windows of Search Console rows into ranked page candidates.
 *
 *   node scripts/find-candidates.ts --site example.com [--run sites/example.com/runs/2026-10-07/find]
 *
 * The orchestrator (scripts/find.ts) calls selectCandidates and flagNewPages
 * directly; this CLI exists so each stage can be re-run on its own.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, flagString } from './lib/args.ts';
import { brandTokens, isBrandQuery } from './lib/brand.ts';
import { loadConfig } from './lib/config.ts';
import { opportunity } from './lib/ctr.ts';
import { aggregate, aggKey, cacheFile, windows } from './lib/gsc.ts';
import { dataDir, runDir, siteDir, todayIso } from './lib/paths.ts';
import { contentTokens, isQuestion, overlapCount } from './lib/questions.ts';
import type { CandidatesFile, DateWindow, GscRow, PageCandidate, PageExtract, QueryStat, SiteConfig } from './lib/types.ts';
import { normalisePage, slugFor, slugWords } from './lib/urls.ts';

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export interface SelectOptions {
  window: DateWindow;
  priorWindow: DateWindow;
  now?: Date;
}

/**
 * Rank pages by the clicks they would gain if their striking-distance queries moved
 * to position 3. Brand queries are kept in each page's table, scored zero, so the
 * writer sees them but spends nothing on them.
 */
export function selectCandidates(current: GscRow[], prior: GscRow[], cfg: SiteConfig, opts: SelectOptions): CandidatesFile {
  const t = cfg.thresholds;
  const cur = aggregate(current, normalisePage);
  const pri = aggregate(prior, normalisePage);
  const tokens = brandTokens(cfg.domain, cfg.brandTerms);

  // Minimum impressions scales down for small sites: the 80th percentile of query
  // impressions across the site, or the configured floor, whichever is lower.
  const perQuery = new Map<string, number>();
  for (const a of cur.values()) perQuery.set(a.query, (perQuery.get(a.query) ?? 0) + a.impressions);
  const p80 = percentile([...perQuery.values()], 80);
  const minImpressions = Math.max(1, Math.min(t.minImpressions, p80));

  let brandCount = 0;
  let belowFloor = 0;
  let outsideWindow = 0;
  const byPage = new Map<string, QueryStat[]>();

  for (const a of cur.values()) {
    const ctr = a.impressions ? a.clicks / a.impressions : 0;
    const brand = isBrandQuery(a.query, tokens, { position: a.position, ctr }, t.brandCtr);
    if (brand) brandCount++;
    const inWindow = a.position >= t.positionMin && a.position <= t.positionMax;
    const enough = a.impressions >= minImpressions;
    if (!brand && !enough) belowFloor++;
    if (!brand && enough && !inWindow) outsideWindow++;
    // Brand queries are kept whatever their position, so the owner sees what they already win,
    // but only above the impressions floor so tiny ones do not clutter the table.
    if (brand ? !enough : !(inWindow && enough)) continue;
    const p = pri.get(aggKey(a.query, a.page));
    const stat: QueryStat = {
      query: a.query,
      page: a.page,
      clicks: a.clicks,
      impressions: a.impressions,
      ctr: Math.round(ctr * 10000) / 10000,
      position: Math.round(a.position * 10) / 10,
      prior: p ? { clicks: p.clicks, impressions: p.impressions, position: Math.round(p.position * 10) / 10 } : null,
      brand,
      isQuestion: isQuestion(a.query),
      score: brand ? 0 : Math.round(opportunity(a.impressions, a.position) * 100) / 100,
    };
    const list = byPage.get(a.page) ?? [];
    list.push(stat);
    byPage.set(a.page, list);
  }

  const pages: PageCandidate[] = [];
  for (const [page, queries] of byPage) {
    const scored = queries.filter((q) => !q.brand);
    if (scored.length === 0) continue;
    queries.sort((x, y) => y.score - x.score || y.impressions - x.impressions);
    pages.push({
      page,
      slug: slugFor(page),
      score: Math.round(scored.reduce((s, q) => s + q.score, 0) * 100) / 100,
      impressions: scored.reduce((s, q) => s + q.impressions, 0),
      clicks: scored.reduce((s, q) => s + q.clicks, 0),
      queries,
      newPage: [],
    });
  }
  pages.sort((x, y) => y.score - x.score);
  const capped = pages.slice(0, t.maxPages);

  const skipped: string[] = [];
  if (brandCount) skipped.push(`${brandCount} brand queries kept in tables but not scored`);
  if (belowFloor) skipped.push(`${belowFloor} queries under ${minImpressions} impressions in 28 days`);
  if (outsideWindow) skipped.push(`${outsideWindow} queries outside positions ${t.positionMin}-${t.positionMax}`);
  if (pages.length > capped.length) skipped.push(`${pages.length - capped.length} pages beyond the cap of ${t.maxPages} (raise thresholds.maxPages in config.json)`);

  return {
    site: cfg.siteUrl,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    window: opts.window,
    priorWindow: opts.priorWindow,
    minImpressions,
    totalQueries: perQuery.size,
    brandQueries: brandCount,
    pages: capped,
    skipped,
  };
}

/**
 * "Wrong page ranks": Google sends this query to a page whose title, H1 and section
 * headings share no meaningful word with it, and whose body barely mentions it. An
 * edit would mean bolting an unrelated topic onto the page; a new page is the honest
 * fix. When the body does cover the topic, the fix is an edit (a heading and an
 * answer), so those queries stay in the table and are not flagged.
 */
export function flagNewPages(file: CandidatesFile, extracts: Map<string, PageExtract>): CandidatesFile {
  const floor = file.minImpressions * 2;
  for (const p of file.pages) {
    const ex = extracts.get(p.page);
    let aboutTokens = contentTokens([ex?.title ?? '', ex?.h1 ?? '', ...(ex?.headings.map((h) => h.text) ?? [])].join(' '));
    if (aboutTokens.length === 0) aboutTokens = slugWords(p.page);
    const bodyTokens = contentTokens((ex?.paragraphs ?? []).join(' '));
    p.newPage = [];
    for (const q of p.queries) {
      if (q.brand) continue;
      const qt = contentTokens(q.query);
      if (qt.length < 2 || q.impressions < floor) continue;
      if (overlapCount(qt, aboutTokens) > 0) continue;
      const bodyCoverage = bodyTokens.length ? overlapCount(qt, bodyTokens) / qt.length : 0;
      if (bodyCoverage >= 0.5) continue;
      p.newPage.push({
        query: q.query,
        reason: 'no title, H1 or heading word matches the query and the body barely mentions it; this page ranks for a topic it is not about',
      });
    }
  }
  return file;
}

function readRows(file: string): GscRow[] {
  if (!existsSync(file)) throw new Error(`Missing ${file}. Run node scripts/gsc-pull.ts first.`);
  return JSON.parse(readFileSync(file, 'utf8')) as GscRow[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const domain = flagString(args, 'site');
  if (!domain) throw new Error('Usage: node scripts/find-candidates.ts --site <domain> [--run <dir>]');
  const site = siteDir(process.cwd(), domain);
  const cfg = loadConfig(site);
  const w = windows();
  const current = readRows(cacheFile(dataDir(site), w.current));
  const prior = readRows(cacheFile(dataDir(site), w.prior));
  const file = selectCandidates(current, prior, cfg, { window: w.current, priorWindow: w.prior });
  const out = flagString(args, 'run') ?? runDir(site, todayIso(), 'find');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'candidates.json'), JSON.stringify(file, null, 2));
  console.log(`${file.pages.length} candidate pages from ${file.totalQueries} queries -> ${join(out, 'candidates.json')}`);
  for (const s of file.skipped) console.log(`  skipped: ${s}`);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
