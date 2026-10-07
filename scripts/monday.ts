#!/usr/bin/env node
/**
 * The deterministic half of /monday: this week against last in Search Console (and GA4
 * when configured), the status of every change the ledger holds, the position moves on
 * exactly those pages and queries, and the pages that moved on their own.
 *
 *   node scripts/monday.ts --site example.com [--date YYYY-MM-DD] [--no-ga4]
 *   node scripts/monday.ts --sample summitplumbing.example       fixture data, no network
 *
 * Writes sites/<domain>/runs/<date>/monday/{memo.json, README.md, pages/*.json}, updates
 * ledger.json with what it observed, and prints the run folder as its last line.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fetchPage, samplePage, writeExtract } from './fetch-page.ts';
import { parseArgs, flagBool, flagString } from './lib/args.ts';
import { getAuth } from './lib/auth.ts';
import { loadConfig } from './lib/config.ts';
import { extract } from './lib/extract.ts';
import { FIXTURES_DIR, placeOnDates, readFixtureRows } from './lib/fixtures.ts';
import { mergeWeeks, pullGa4 } from './lib/ga4.ts';
import { pullWindow, windows } from './lib/gsc.ts';
import { applyObservations, ledgerPath, loadLedger, saveLedger } from './lib/ledger.ts';
import { buildMemo, writeMemoFiles } from './lib/memo.ts';
import { dataDir, runDir, siteDir, todayIso } from './lib/paths.ts';
import type { GscRow, Observation, PageExtract } from './lib/types.ts';
import { isOperatorQuery } from './lib/questions.ts';
import { slugFor } from './lib/urls.ts';
import { inWindow, weekWindows } from './lib/weeks.ts';

/** Sample mode: a page that was "edited" lives in pages-after/, otherwise the original fixture page. */
function samplePageAfter(fixtureDomain: string, url: string): PageExtract {
  const after = join(FIXTURES_DIR, fixtureDomain, 'pages-after', `${slugFor(url)}.html`);
  if (existsSync(after)) return extract(readFileSync(after, 'utf8'), url);
  return samplePage(fixtureDomain, url);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sample = flagString(args, 'sample');
  const domain = sample ?? flagString(args, 'site');
  if (!domain) throw new Error('Usage: node scripts/monday.ts --site <domain> | --sample <fixtureDomain>  [--date YYYY-MM-DD] [--no-ga4]');
  const date = flagString(args, 'date') ?? todayIso();
  const base = flagString(args, 'cwd') ? resolve(flagString(args, 'cwd') as string) : process.cwd();
  const log = (s: string) => console.log(s);

  const site = siteDir(base, domain);
  if (sample && !existsSync(join(site, 'config.json'))) {
    throw new Error(`No sample workspace at ${site}. Run \`node scripts/find.ts --sample ${sample}\` first; /monday reports on what /find proposed.`);
  }
  const cfg = loadConfig(site);
  if (sample && !existsSync(ledgerPath(site))) {
    const fixtureLedger = join(FIXTURES_DIR, sample, 'ledger.json');
    if (existsSync(fixtureLedger)) {
      copyFileSync(fixtureLedger, ledgerPath(site));
      log('Sample ledger copied from fixtures (the suggestions a /find run made on this site).');
    }
  }
  const ledger = loadLedger(site, cfg.siteUrl);
  const run = runDir(site, date, 'monday');
  mkdirSync(run, { recursive: true });
  const weeks = weekWindows(new Date(`${date}T12:00:00Z`));

  // 1. Search Console rows for the two weeks.
  let thisRows: GscRow[];
  let lastRows: GscRow[];
  let auth: ReturnType<typeof getAuth> | null = null;
  if (sample) {
    const w28 = windows(new Date(`${date}T12:00:00Z`));
    const placed = placeOnDates(readFixtureRows(join(FIXTURES_DIR, sample)), w28.prior, w28.current);
    const all = [...placed.prior, ...placed.current];
    thisRows = all.filter((r) => inWindow(r.date, weeks.thisWeek));
    lastRows = all.filter((r) => inWindow(r.date, weeks.lastWeek));
    log(`Sample data: ${thisRows.length} rows this week, ${lastRows.length} last week`);
  } else {
    auth = getAuth();
    const t = await pullWindow(auth, cfg.siteUrl, weeks.thisWeek, dataDir(site));
    const l = await pullWindow(auth, cfg.siteUrl, weeks.lastWeek, dataDir(site));
    thisRows = t.rows;
    lastRows = l.rows;
    log(`Search Console: ${thisRows.length} rows ${weeks.thisWeek.start}..${weeks.thisWeek.end} ${t.fromCache ? '(cached)' : '(pulled)'}, ${lastRows.length} rows the week before ${l.fromCache ? '(cached)' : '(pulled)'}`);
  }
  thisRows = thisRows.filter((r) => !isOperatorQuery(r.query));
  lastRows = lastRows.filter((r) => !isOperatorQuery(r.query));

  // 2. GA4, when configured.
  let ga4: { propertyId: string; pages: ReturnType<typeof mergeWeeks> } | null = null;
  if (!sample && cfg.ga4PropertyId && !flagBool(args, 'no-ga4') && auth) {
    try {
      const t = await pullGa4(auth, cfg.ga4PropertyId, weeks.thisWeek, dataDir(site));
      const l = await pullGa4(auth, cfg.ga4PropertyId, weeks.lastWeek, dataDir(site));
      ga4 = { propertyId: cfg.ga4PropertyId, pages: mergeWeeks(t, l) };
      log(`GA4: ${ga4.pages.length} landing pages`);
    } catch (e) {
      log(`GA4 skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Re-fetch every page the ledger mentions.
  const pages = [...new Set(ledger.entries.map((e) => e.page))];
  const extracts = new Map<string, PageExtract>();
  for (const url of pages) {
    const ex = sample ? samplePageAfter(sample, url) : await fetchPage(url);
    writeExtract(run, ex);
    extracts.set(url, ex);
    log(`  ${ex.status.padEnd(6)} ${url}`);
  }

  // 4. Memo data.
  const memo = buildMemo({
    site: cfg.siteUrl,
    date,
    thisWeek: weeks.thisWeek,
    lastWeek: weeks.lastWeek,
    thisRows,
    lastRows,
    ledger: ledger.entries,
    extracts,
    ga4,
    // A week is a quarter of the /find window, but fewer than ten impressions is noise whatever the site.
    minImpressions: Math.max(10, Math.round(cfg.thresholds.minImpressions / 2)),
  });
  const runCommand = sample ? `node scripts/monday.ts --sample ${sample}` : `node scripts/monday.ts --site ${domain}`;
  writeMemoFiles(run, memo, runCommand);

  // 5. Write what was seen back into the ledger.
  const observations = new Map<string, Observation>();
  for (const c of memo.changes) {
    observations.set(c.id, {
      date,
      status: c.status,
      contentHash: extracts.get(c.page)?.contentHash ?? null,
      positions: Object.fromEntries(c.queries.map((q) => [q.query, q.thisWeek])),
    });
  }
  saveLedger(site, applyObservations(ledger, observations));
  const counts = memo.changes.reduce<Record<string, number>>((a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a), {});
  log(`Ledger: ${memo.changes.length} suggestions checked (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`);
  writeFileSync(join(run, 'memo.md.pending'), ''); // marker: Claude replaces this with memo.md

  const rel = relative(process.cwd(), run).replace(/\\/g, '/') || run;
  log('');
  log(`Run folder: ${rel}`);
  log('Next: Claude reads memo.json and README.md and writes memo.md.');
  console.log(rel);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
