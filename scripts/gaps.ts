#!/usr/bin/env node
/**
 * The deterministic half of /gaps: the questions people ask in this market, what the
 * site has for each, what Gemini answers, and a ranked list of the open ones.
 *
 *   node scripts/gaps.ts --site example.com [--date YYYY-MM-DD] [--no-ai]
 *   node scripts/gaps.ts --sample summitplumbing.example         fixture data, no network
 *
 * Writes sites/<domain>/runs/<date>/gaps/{questions.json, pages/*.json, ai-check.json,
 * gaps.json, README.md}. Claude writes one brief per gap afterwards.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { aiCheckPath, geminiAsker, noKeyResult, runAiCheck } from './ai-check.ts';
import { fetchPage, samplePage, writeExtract } from './fetch-page.ts';
import { parseArgs, flagBool, flagString } from './lib/args.ts';
import { getAuth } from './lib/auth.ts';
import { defaultConfig, loadConfig, saveConfig } from './lib/config.ts';
import { FIXTURES_DIR, placeOnDates, readFixtureRows } from './lib/fixtures.ts';
import { buildQuestions, DEFAULT_MAX_BRIEFS, scoreGaps } from './lib/gaps.ts';
import { pullWindow, windows } from './lib/gsc.ts';
import { dataDir, runDir, siteDir, todayIso } from './lib/paths.ts';
import { CREDIT, PENDING } from './lib/readme.ts';
import type { AiCheckFile, CandidatesFile, GapsFile, GscRow, PageExtract, QuestionsFile, SiteConfig } from './lib/types.ts';
import { slugFor } from './lib/urls.ts';

interface SeedLite {
  siteUrl: string;
  brandTerms: string[];
  locale: string;
  market?: SiteConfig['market'];
}

function sampleConfig(fixtureDomain: string, site: string): SiteConfig {
  const seedFile = join(FIXTURES_DIR, fixtureDomain, 'seed.json');
  if (!existsSync(seedFile)) throw new Error(`No fixture named ${fixtureDomain}. Available: summitplumbing.example, slotwise.example`);
  const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as SeedLite;
  const cfg = existsSync(join(site, 'config.json')) ? loadConfig(site) : { ...defaultConfig(seed.siteUrl), brandTerms: seed.brandTerms, locale: seed.locale };
  if (!cfg.market && seed.market) cfg.market = seed.market;
  saveConfig(site, cfg);
  return cfg;
}

/** Pages from the most recent /find run, so "does the site have a page about this" sees more than the ranking pages. */
function latestFindExtracts(site: string): Map<string, PageExtract> {
  const out = new Map<string, PageExtract>();
  const runs = join(site, 'runs');
  if (!existsSync(runs)) return out;
  const dates = readdirSync(runs).filter((d) => existsSync(join(runs, d, 'find', 'pages'))).sort();
  const latest = dates[dates.length - 1];
  if (!latest) return out;
  const dir = join(runs, latest, 'find', 'pages');
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const ex = JSON.parse(readFileSync(join(dir, f), 'utf8')) as PageExtract;
    out.set(ex.url, ex);
  }
  return out;
}

export function renderGapsReadme(q: QuestionsFile, g: GapsFile, ai: AiCheckFile | null, maxBriefs: number, runCommand: string, date: string): string {
  const L: string[] = [];
  L.push(`# /gaps run: ${g.site}, ${date}`);
  L.push('');
  L.push(`${q.questions.length} questions asked (${q.questions.filter((x) => x.source === 'search-console').length} from Search Console, ${q.questions.filter((x) => x.source === 'template').length} from market topics, ${q.questions.filter((x) => x.source === 'user').length} from your list). ${g.gaps.length} are open; ${g.covered.length} the site already covers. AI answers: ${g.mode === 'none' ? 'not run' : g.mode}.`);
  L.push('');
  L.push(`The top ${Math.min(maxBriefs, g.gaps.length)} get a brief. Raise \`market.maxBriefs\` in config.json for more.`);
  L.push('');
  L.push('| # | Question | Impressions | Ranks | Site page about it | AI answer | Why it is open | Brief |');
  L.push('|--:|----------|------------:|------:|--------------------|-----------|----------------|-------|');
  g.gaps.forEach((s, i) => {
    const ranks = s.question.position !== null ? `${s.question.position} on ${s.question.rankingPage?.replace(/^https?:\/\/[^/]+/, '') || '?'}` : '–';
    const aiCell = !s.aiAnswered ? '–' : s.aiCitesSite ? 'cites you' : s.aiMentionsSite ? 'mentions you' : s.aiCompetitors.length ? `names ${s.aiCompetitors.slice(0, 2).join(', ')}` : 'no mention';
    const brief = i < maxBriefs ? `[${slugFor(s.question.question).slice(0, 60)}](${slugFor(s.question.question).slice(0, 60)}.md) ${PENDING}` : '';
    L.push(`| ${i + 1} | ${s.question.question} | ${s.question.impressions.toLocaleString('en-US')} | ${ranks} | ${s.sitePage ? s.sitePage.replace(/^https?:\/\/[^/]+/, '') || '/' : 'none'} | ${aiCell} | ${s.signals.filter((x) => !x.startsWith('covered')).join('; ')} | ${brief} |`);
  });
  L.push('');
  if (g.covered.length) {
    L.push('## Already covered');
    L.push('');
    for (const c of g.covered) L.push(`- ${c.question.question} (${c.sitePage?.replace(/^https?:\/\/[^/]+/, '')})`);
    L.push('');
  }
  const skipped = [...q.skipped, ...g.skipped];
  if (ai?.note) skipped.push(`AI answers: ${ai.note}`);
  if (ai?.skippedReason) skipped.push(`AI answers: ${ai.skippedReason}`);
  if (skipped.length) {
    L.push('## Skipped');
    L.push('');
    for (const s of skipped) L.push(`- ${s}`);
    L.push('');
  }
  L.push('## Run again');
  L.push('');
  L.push('```');
  L.push(runCommand);
  L.push('```');
  L.push('');
  L.push('Briefs written from this run are recorded in `ledger.json` as new-page suggestions, so `/monday` can ask whether they were published.');
  L.push('');
  L.push(CREDIT);
  L.push('');
  return L.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sample = flagString(args, 'sample');
  const domain = sample ?? flagString(args, 'site');
  if (!domain) throw new Error('Usage: node scripts/gaps.ts --site <domain> | --sample <fixtureDomain>  [--date YYYY-MM-DD] [--no-ai]');
  const date = flagString(args, 'date') ?? todayIso();
  const base = flagString(args, 'cwd') ? resolve(flagString(args, 'cwd') as string) : process.cwd();
  const log = (s: string) => console.log(s);

  const site = siteDir(base, domain);
  const cfg = sample ? sampleConfig(sample, site) : loadConfig(site);
  const run = runDir(site, date, 'gaps');
  mkdirSync(run, { recursive: true });
  const w = windows(new Date(`${date}T12:00:00Z`));

  // 1. Search Console, last 28 days (the /find cache serves this when it ran today).
  let rows: GscRow[];
  if (sample) {
    rows = placeOnDates(readFixtureRows(join(FIXTURES_DIR, sample)), w.prior, w.current).current;
    log(`Sample data: ${rows.length} rows from fixtures/${sample}`);
  } else {
    const r = await pullWindow(getAuth(), cfg.siteUrl, w.current, dataDir(site));
    rows = r.rows;
    log(`Search Console: ${rows.length} rows ${w.current.start}..${w.current.end} ${r.fromCache ? '(cached)' : '(pulled)'}`);
  }

  // 2. Questions.
  const userFile = join(site, 'questions.txt');
  const userQuestions = existsSync(userFile) ? readFileSync(userFile, 'utf8').split(/\r?\n/) : [];
  const questions = buildQuestions(rows, cfg, { window: w.current, userQuestions });
  writeFileSync(join(run, 'questions.json'), JSON.stringify(questions, null, 2));
  log(`${questions.questions.length} questions (${questions.questions.filter((q) => q.source === 'search-console').length} from Search Console)`);
  if (!cfg.market) log('No "market" block in config.json: add topics, competitors and an audience line to get template questions and competitor detection. See docs/gaps.md.');

  // 3. Pages: those that rank for the questions, plus the latest /find run's extracts.
  const extracts = latestFindExtracts(site);
  const toFetch = [...new Set(questions.questions.map((q) => q.rankingPage).filter((p): p is string => !!p))].filter((p) => !extracts.has(p)).slice(0, 25);
  for (const url of toFetch) {
    const ex = sample ? samplePage(sample, url) : await fetchPage(url);
    writeExtract(run, ex);
    extracts.set(url, ex);
    log(`  ${ex.status.padEnd(6)} ${url}`);
  }
  if (extracts.size) log(`${extracts.size} site pages known (${toFetch.length} fetched now)`);

  // 4. AI answers for every question.
  let ai: AiCheckFile | null = null;
  const plan = questions.questions.map((q) => ({ page: q.rankingPage ?? '', query: q.query ?? q.question, asked: q.question }));
  const sampleAi = sample ? join(FIXTURES_DIR, sample, 'ai-check-gaps.json') : null;
  if (sampleAi && existsSync(sampleAi)) {
    ai = JSON.parse(readFileSync(sampleAi, 'utf8')) as AiCheckFile;
    log(`AI answers: ${ai.results.length} from fixtures`);
  } else if (flagBool(args, 'no-ai') || sample) {
    ai = { ...noKeyResult(cfg), skippedReason: sample ? 'No ai-check-gaps.json fixture for this sample.' : 'Skipped by --no-ai.' };
  } else if (!process.env.GEMINI_API_KEY) {
    ai = noKeyResult(cfg);
    log('AI answers skipped: GEMINI_API_KEY is not set');
  } else {
    ai = await runAiCheck(cfg, { pages: [] } as unknown as CandidatesFile, await geminiAsker(process.env.GEMINI_API_KEY), { log: (s) => log(`  ${s}`), plan });
    log(`AI answers: ${ai.results.length} (${ai.mode}), ${ai.skipped} skipped${ai.skippedReason ? ` (${ai.skippedReason})` : ''}`);
  }
  writeFileSync(aiCheckPath(run), JSON.stringify(ai, null, 2));

  // 5. Score and write.
  const { gaps, covered } = scoreGaps(questions, ai.results.length ? ai : null, extracts, cfg);
  const file: GapsFile = {
    site: cfg.siteUrl,
    generatedAt: new Date().toISOString(),
    mode: ai.results.length ? ai.mode : 'none',
    gaps,
    covered,
    skipped: [],
  };
  writeFileSync(join(run, 'gaps.json'), JSON.stringify(file, null, 2));
  const maxBriefs = cfg.market?.maxBriefs ?? DEFAULT_MAX_BRIEFS;
  const runCommand = sample ? `node scripts/gaps.ts --sample ${sample}` : `node scripts/gaps.ts --site ${domain}`;
  writeFileSync(join(run, 'README.md'), renderGapsReadme(questions, file, ai, maxBriefs, runCommand, date));
  log(`${gaps.length} open questions, ${covered.length} covered; briefs to write: ${Math.min(maxBriefs, gaps.length)}`);

  const rel = relative(process.cwd(), run).replace(/\\/g, '/') || run;
  log('');
  log(`Run folder: ${rel}`);
  log('Next: Claude reads gaps.json, ai-check.json and pages/*.json and writes one brief per open question.');
  console.log(rel);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
