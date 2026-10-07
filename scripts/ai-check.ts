#!/usr/bin/env node
/**
 * Ask Gemini, with Google Search grounding, the top questions each candidate page
 * should be winning, and record who it cites.
 *
 *   GEMINI_API_KEY=... node scripts/ai-check.ts --site example.com --run <dir>
 *   node scripts/ai-check.ts --sample summitplumbing.example --run <dir>    (copies the fixture, no network)
 *
 * One call per query. Stops at the daily cap in config.json (shared across sites on
 * this machine) or when the API says the quota is exhausted, and reports how many
 * were skipped. Without GEMINI_API_KEY it writes an empty result and says so.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, flagString } from './lib/args.ts';
import { loadConfig, siteHost } from './lib/config.ts';
import { FIXTURES_DIR } from './lib/fixtures.ts';
import { canSpend, loadUsage, parseGrounding, resolveCitations, saveUsage, type GroundedResponse } from './lib/grounding.ts';
import { siteDir } from './lib/paths.ts';
import { toUserQuestion } from './lib/questions.ts';
import type { AiCheckFile, AiCheckResult, CandidatesFile, SiteConfig } from './lib/types.ts';

export type AskFn = (model: string, prompt: string) => Promise<GroundedResponse>;

export function aiCheckPath(run: string): string {
  return join(run, 'ai-check.json');
}

/** Build the real asker lazily so sample mode never loads the SDK or needs a key. */
export async function geminiAsker(apiKey: string): Promise<AskFn> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  return async (model, prompt) => {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    return res as unknown as GroundedResponse;
  };
}

export function noKeyResult(cfg: SiteConfig): AiCheckFile {
  return {
    site: cfg.siteUrl,
    model: cfg.ai.model,
    results: [],
    skipped: 0,
    skippedReason: 'GEMINI_API_KEY is not set, so the AI answer check was skipped. Set it (free key from https://aistudio.google.com/apikey) and run again to see which answers cite competitors.',
    usedToday: 0,
    dailyCap: cfg.ai.dailyCap,
  };
}

function isQuotaError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  return status === 429 || /RESOURCE_EXHAUSTED|quota|429/i.test(msg);
}

export async function runAiCheck(
  cfg: SiteConfig,
  candidates: CandidatesFile,
  ask: AskFn,
  opts: { log?: (s: string) => void; persistUsage?: boolean; resolve?: boolean; locale?: string } = {},
): Promise<AiCheckFile> {
  const log = opts.log ?? (() => {});
  const host = siteHost(cfg.siteUrl);
  const usage = loadUsage();
  const results: AiCheckResult[] = [];
  let skipped = 0;
  let skippedReason: string | null = null;

  const plan: { page: string; query: string }[] = [];
  for (const p of candidates.pages) {
    for (const q of p.queries.filter((q) => !q.brand).slice(0, cfg.thresholds.queriesPerPageForAi)) plan.push({ page: p.page, query: q.query });
  }

  for (let i = 0; i < plan.length; i++) {
    const { page, query } = plan[i];
    if (skippedReason) {
      skipped++;
      continue;
    }
    if (!canSpend(usage, cfg.ai.dailyCap)) {
      skippedReason = `Daily cap of ${cfg.ai.dailyCap} grounded Gemini calls reached (${usage.count} used today). The rest run tomorrow, or raise ai.dailyCap in config.json if your quota allows.`;
      skipped++;
      continue;
    }
    const asked = toUserQuestion(query);
    const prompt = `${asked}\n\nAnswer the way you would for someone in ${opts.locale ?? cfg.locale}. Be concise.`;
    try {
      const resp = await ask(cfg.ai.model, prompt);
      usage.count++;
      if (opts.persistUsage !== false) saveUsage(usage);
      let parsed = parseGrounding(resp, host);
      if (opts.resolve !== false) parsed = await resolveCitations(parsed, host);
      results.push({ page, query, asked, model: cfg.ai.model, ...parsed });
      log(`${String(i + 1).padStart(3)}/${plan.length} ${parsed.onSite ? 'on-site ' : parsed.competitors.length ? 'competitor' : 'uncited  '} ${asked}`);
    } catch (e) {
      if (isQuotaError(e)) {
        skippedReason = `Gemini reported its quota was exhausted after ${usage.count} calls today. The remaining questions were skipped; run again tomorrow.`;
        skipped++;
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ page, query, asked, model: cfg.ai.model, answer: '', cited: [], onSite: false, competitors: [], error: msg });
      log(`${String(i + 1).padStart(3)}/${plan.length} error    ${asked}: ${msg}`);
    }
  }

  return { site: cfg.siteUrl, model: cfg.ai.model, results, skipped, skippedReason, usedToday: usage.count, dailyCap: cfg.ai.dailyCap };
}

export function sampleAiCheck(fixtureDomain: string, run: string): AiCheckFile {
  const src = join(FIXTURES_DIR, fixtureDomain, 'ai-check.json');
  copyFileSync(src, aiCheckPath(run));
  return JSON.parse(readFileSync(src, 'utf8')) as AiCheckFile;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const run = flagString(args, 'run');
  if (!run) throw new Error('Usage: node scripts/ai-check.ts --run <dir> (--site <domain> | --sample <fixtureDomain>)');
  const sample = flagString(args, 'sample');
  if (sample) {
    const f = sampleAiCheck(sample, run);
    console.log(`Sample AI check: ${f.results.length} answers copied from fixtures.`);
    return;
  }
  const domain = flagString(args, 'site');
  if (!domain) throw new Error('Pass --site <domain> or --sample <fixtureDomain>');
  const cfg = loadConfig(siteDir(process.cwd(), domain));
  const candidates = JSON.parse(readFileSync(join(run, 'candidates.json'), 'utf8')) as CandidatesFile;
  const key = process.env.GEMINI_API_KEY;
  const file = key ? await runAiCheck(cfg, candidates, await geminiAsker(key), { log: console.log }) : noKeyResult(cfg);
  writeFileSync(aiCheckPath(run), JSON.stringify(file, null, 2));
  if (file.skippedReason) console.log(file.skippedReason);
  console.log(`${file.results.length} answers, ${file.skipped} skipped -> ${aiCheckPath(run)}`);
  if (!existsSync(aiCheckPath(run))) throw new Error('ai-check.json was not written');
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
