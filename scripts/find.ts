#!/usr/bin/env node
/**
 * The deterministic half of /find: pull, score, fetch, check, and lay out a run folder
 * for Claude to write into.
 *
 *   node scripts/find.ts --site example.com              real data (needs setup.ts and sites.ts first)
 *   node scripts/find.ts --sample summitplumbing.example  fixture data, no credentials, no network
 *
 * Options: --date YYYY-MM-DD (run folder date, default today), --no-ai (skip Gemini),
 *          --cwd <dir> (where sites/ lives; default the current directory).
 *
 * Writes sites/<domain>/runs/<date>/find/{candidates.json, pages/*.json, ai-check.json, README.md}
 * and prints the run directory as its last line.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { geminiAsker, noKeyResult, runAiCheck, sampleAiCheck, aiCheckPath } from './ai-check.ts';
import { fetchCandidates, fetchPage, samplePage } from './fetch-page.ts';
import { flagNewPages, selectCandidates } from './find-candidates.ts';
import { parseArgs, flagBool, flagString } from './lib/args.ts';
import { getAuth } from './lib/auth.ts';
import { defaultConfig, loadConfig, saveConfig } from './lib/config.ts';
import { FIXTURES_DIR, placeOnDates, readFixtureRows } from './lib/fixtures.ts';
import { pullWindow, windows } from './lib/gsc.ts';
import { dataDir, runDir, siteDir, todayIso } from './lib/paths.ts';
import { writeRunReadme } from './lib/readme.ts';
import type { AiCheckFile, GscRow, SiteConfig } from './lib/types.ts';

interface SeedLite {
  siteUrl: string;
  brandTerms: string[];
  locale: string;
}

function sampleConfig(fixtureDomain: string, site: string): SiteConfig {
  if (existsSync(join(site, 'config.json'))) return loadConfig(site);
  const seedFile = join(FIXTURES_DIR, fixtureDomain, 'seed.json');
  if (!existsSync(seedFile)) throw new Error(`No fixture named ${fixtureDomain}. Available: summitplumbing.example, slotwise.example`);
  const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as SeedLite;
  const cfg = { ...defaultConfig(seed.siteUrl), brandTerms: seed.brandTerms, locale: seed.locale };
  saveConfig(site, cfg);
  return cfg;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sample = flagString(args, 'sample');
  const domain = sample ?? flagString(args, 'site');
  if (!domain) throw new Error('Usage: node scripts/find.ts --site <domain> | --sample <fixtureDomain>  [--date YYYY-MM-DD] [--no-ai]');
  const date = flagString(args, 'date') ?? todayIso();
  const noAi = flagBool(args, 'no-ai');
  const log = (s: string) => console.log(s);

  const base = flagString(args, 'cwd') ? resolve(flagString(args, 'cwd') as string) : process.cwd();
  const site = siteDir(base, domain);
  const cfg = sample ? sampleConfig(sample, site) : loadConfig(site);
  const run = runDir(site, date, 'find');
  mkdirSync(run, { recursive: true });
  const w = windows(new Date(`${date}T12:00:00Z`));

  // 1. Search Console rows for both windows.
  let current: GscRow[];
  let prior: GscRow[];
  if (sample) {
    const placed = placeOnDates(readFixtureRows(join(FIXTURES_DIR, sample)), w.prior, w.current);
    current = placed.current;
    prior = placed.prior;
    log(`Sample data: ${current.length} current rows, ${prior.length} prior rows from fixtures/${sample}`);
  } else {
    const auth = getAuth();
    const c = await pullWindow(auth, cfg.siteUrl, w.current, dataDir(site));
    const p = await pullWindow(auth, cfg.siteUrl, w.prior, dataDir(site));
    current = c.rows;
    prior = p.rows;
    log(`Search Console: ${current.length} rows ${w.current.start}..${w.current.end} ${c.fromCache ? '(cached)' : '(pulled)'}, ${prior.length} prior rows ${p.fromCache ? '(cached)' : '(pulled)'}`);
  }

  // 2. Candidates.
  let candidates = selectCandidates(current, prior, cfg, { window: w.current, priorWindow: w.prior });
  log(`${candidates.pages.length} candidate pages from ${candidates.totalQueries} queries (floor ${candidates.minImpressions} impressions)`);

  // 3. Pages.
  const extracts = await fetchCandidates(run, candidates, async (url) => (sample ? samplePage(sample, url) : fetchPage(url)), (s) => log(`  ${s}`));

  // 4. Wrong-page flags need titles, so they come after the fetch.
  candidates = flagNewPages(candidates, extracts);
  writeFileSync(join(run, 'candidates.json'), JSON.stringify(candidates, null, 2));
  const flagged = candidates.pages.reduce((n, p) => n + p.newPage.length, 0);
  if (flagged) log(`${flagged} queries flagged as new-page opportunities`);

  // 5. AI answers.
  let ai: AiCheckFile;
  if (sample) {
    ai = sampleAiCheck(sample, run);
    log(`AI check: ${ai.results.length} grounded answers from fixtures`);
  } else if (noAi) {
    ai = { ...noKeyResult(cfg), skippedReason: 'Skipped by --no-ai.' };
    writeFileSync(aiCheckPath(run), JSON.stringify(ai, null, 2));
    log('AI check skipped (--no-ai)');
  } else if (!process.env.GEMINI_API_KEY) {
    ai = noKeyResult(cfg);
    writeFileSync(aiCheckPath(run), JSON.stringify(ai, null, 2));
    log('AI check skipped: GEMINI_API_KEY is not set');
  } else {
    ai = await runAiCheck(cfg, candidates, await geminiAsker(process.env.GEMINI_API_KEY), { log: (s) => log(`  ${s}`) });
    writeFileSync(aiCheckPath(run), JSON.stringify(ai, null, 2));
    log(`AI check: ${ai.results.length} ${ai.mode} answers, ${ai.skipped} skipped${ai.skippedReason ? ` (${ai.skippedReason})` : ''}`);
    if (ai.note) log(`  ${ai.note}`);
  }

  // 6. Run README with pending one-liners for Claude to fill.
  const runCommand = sample ? `node scripts/find.ts --sample ${sample}` : `node scripts/find.ts --site ${domain}`;
  writeRunReadme(run, candidates, ai, extracts, { runCommand, date });

  const rel = relative(process.cwd(), run).replace(/\\/g, '/') || run;
  log('');
  log(`Run folder: ${rel}`);
  log('Next: Claude reads candidates.json, pages/*.json and ai-check.json and writes one file per page.');
  console.log(rel);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
