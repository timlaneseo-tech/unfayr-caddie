#!/usr/bin/env node
/**
 * Ask Gemini the top questions each candidate page should be winning, and record what
 * it says and, when the key's tier allows Google Search grounding, whom it cites.
 *
 *   GEMINI_API_KEY=... node scripts/ai-check.ts --site example.com --run <dir>
 *   node scripts/ai-check.ts --sample summitplumbing.example --run <dir>    (copies the fixture, no network)
 *
 * Modes (config.json ai.mode): `auto` tries grounding and falls back to plain answers
 * when grounding is refused, which is the case on the free tier; `grounded` insists;
 * `plain` never asks for citations. One call per query, paced for free-tier per-minute
 * limits, stopping at the daily cap or when Google says the quota is exhausted.
 * Without GEMINI_API_KEY it writes an empty result and says so.
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

export type AskFn = (model: string, prompt: string, grounded: boolean) => Promise<GroundedResponse>;

/** Free-tier models allow 5 to 15 requests a minute, so calls are spaced out rather than fired in a burst. */
export const MIN_INTERVAL_MS = 4500;

export const GROUNDING_NOTE =
  'Answers are plain (no citations): Google Search grounding is not available on the Gemini free tier. Caddie records what Gemini says and whether it mentions your site. To see which sites it cites, link a billing account to the key\'s project in AI Studio (Tier 1; 5,000 grounded searches a month are then free) and set ai.mode to "grounded" in config.json.';

export function aiCheckPath(run: string): string {
  return join(run, 'ai-check.json');
}

/** Build the real asker lazily so sample mode never loads the SDK or needs a key. */
export async function geminiAsker(apiKey: string): Promise<AskFn> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  return async (model, prompt, grounded) => {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: grounded ? { tools: [{ googleSearch: {} }] } : {},
    });
    return res as unknown as GroundedResponse;
  };
}

export function noKeyResult(cfg: SiteConfig): AiCheckFile {
  return {
    site: cfg.siteUrl,
    model: cfg.ai.model,
    mode: 'plain',
    note: null,
    results: [],
    skipped: 0,
    skippedReason: 'GEMINI_API_KEY is not set, so the AI answer check was skipped. Set it (free key from https://aistudio.google.com/apikey) and run again to see what Gemini answers for these questions.',
    usedToday: 0,
    dailyCap: cfg.ai.dailyCap,
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isQuotaError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 429 || /RESOURCE_EXHAUSTED|quota|429/i.test(message(e));
}

/** 402 means the key's project is attached to a billing account with no credit; the free tier does not apply to it. */
function isBillingError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 402 || /prepayment credits|billing details|402/i.test(message(e));
}

/** A model this key cannot use will fail every call identically, so one failure is enough. */
function isModelError(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  return status === 404 || /NOT_FOUND|no longer available|is not found|not supported for generateContent/i.test(message(e));
}

function isPerMinuteLimit(e: unknown): boolean {
  return /PerMinute|per minute|RequestsPerMinute|retry in \d+/i.test(message(e));
}

export interface AskItem {
  page: string;
  query: string;
  /** How to phrase it; defaults to toUserQuestion(query). */
  asked?: string;
}

export interface RunOptions {
  log?: (s: string) => void;
  persistUsage?: boolean;
  resolve?: boolean;
  locale?: string;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  /** Ask exactly these instead of the top queries per candidate page (used by /gaps). */
  plan?: AskItem[];
}

export async function runAiCheck(cfg: SiteConfig, candidates: CandidatesFile, ask: AskFn, opts: RunOptions = {}): Promise<AiCheckFile> {
  const log = opts.log ?? (() => {});
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const minInterval = opts.minIntervalMs ?? MIN_INTERVAL_MS;
  const host = siteHost(cfg.siteUrl);
  const usage = loadUsage();
  const results: AiCheckResult[] = [];
  let skipped = 0;
  let skippedReason: string | null = null;
  let grounded = cfg.ai.mode !== 'plain';
  let note: string | null = cfg.ai.mode === 'plain' ? GROUNDING_NOTE : null;
  let lastCall = 0;

  const askPaced = async (prompt: string): Promise<GroundedResponse> => {
    const wait = lastCall + minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      return await ask(cfg.ai.model, prompt, grounded);
    } catch (e) {
      // A per-minute limit clears on its own; wait out the minute once before giving up.
      if (isQuotaError(e) && isPerMinuteLimit(e)) {
        log('  per-minute limit hit; waiting 61s');
        await sleep(61_000);
        lastCall = Date.now();
        return await ask(cfg.ai.model, prompt, grounded);
      }
      throw e;
    }
  };

  const plan: AskItem[] = opts.plan ?? [];
  if (!opts.plan) {
    for (const p of candidates.pages) {
      for (const q of p.queries.filter((q) => !q.brand).slice(0, cfg.thresholds.queriesPerPageForAi)) plan.push({ page: p.page, query: q.query });
    }
  }

  for (let i = 0; i < plan.length; i++) {
    const { page, query } = plan[i];
    if (skippedReason) {
      skipped++;
      continue;
    }
    if (!canSpend(usage, cfg.ai.dailyCap)) {
      skippedReason = `Daily cap of ${cfg.ai.dailyCap} Gemini calls reached (${usage.count} used today). The rest run tomorrow, or raise ai.dailyCap in config.json if your quota allows.`;
      skipped++;
      continue;
    }
    const asked = plan[i].asked ?? toUserQuestion(query);
    const prompt = `${asked}\n\nAnswer the way you would for someone in ${opts.locale ?? cfg.locale}. Be concise.`;
    try {
      let resp: GroundedResponse;
      try {
        resp = await askPaced(prompt);
      } catch (e) {
        // Grounding refused before any grounded call succeeded: on the free tier this is
        // the normal case, so in auto mode drop to plain answers and carry on.
        const groundedSoFar = results.some((r) => r.cited.length > 0);
        if (grounded && cfg.ai.mode === 'auto' && isQuotaError(e) && !isPerMinuteLimit(e) && !groundedSoFar) {
          grounded = false;
          note = GROUNDING_NOTE;
          log('  grounding refused on this key; continuing with plain answers');
          resp = await askPaced(prompt);
        } else {
          throw e;
        }
      }
      usage.count++;
      if (opts.persistUsage !== false) saveUsage(usage);
      let parsed = parseGrounding(resp, host, cfg.brandTerms);
      if (grounded && opts.resolve !== false) parsed = await resolveCitations(parsed, host);
      results.push({ page, query, asked, model: cfg.ai.model, ...parsed });
      const tag = parsed.onSite ? 'cites you ' : parsed.competitors.length ? 'competitor' : parsed.mentionsSite ? 'mentions  ' : 'no mention';
      log(`${String(i + 1).padStart(3)}/${plan.length} ${tag} ${asked}`);
    } catch (e) {
      if (isBillingError(e)) {
        skippedReason = `Gemini returned HTTP 402 "prepayment credits are depleted": the key's project is attached to a billing account with no credit, so the free tier is not being applied. In Google Cloud Console, Billing, Your projects, disable billing for that project (or create a key under a new project at https://aistudio.google.com/apikey). All questions were skipped.`;
        skipped++;
        continue;
      }
      if (isModelError(e)) {
        skippedReason = `Gemini says the model "${cfg.ai.model}" is not available to this API key. Set "ai.model" in config.json to a current model (gemini-3.1-flash-lite is the free-tier default) and run again. All questions were skipped.`;
        skipped++;
        continue;
      }
      if (isQuotaError(e)) {
        skippedReason =
          usage.count === 0
            ? grounded
              ? `Gemini refused grounded calls (HTTP 429) and ai.mode is "grounded". Google Search grounding needs a billing account on the key's project (Tier 1). Link one, or set ai.mode to "auto" or "plain". All questions were skipped.`
              : `Gemini refused the first call with a quota error (HTTP 429) before any were made today. Check https://ai.dev/rate-limit for this project; the free-tier daily limit for ${cfg.ai.model} may already be used by something else. All questions were skipped.`
            : `Gemini reported its quota was exhausted after ${usage.count} calls today. The remaining questions were skipped; run again tomorrow.`;
        skipped++;
        continue;
      }
      results.push({ page, query, asked, model: cfg.ai.model, answer: '', cited: [], onSite: false, competitors: [], mentionsSite: false, error: message(e) });
      log(`${String(i + 1).padStart(3)}/${plan.length} error    ${asked}: ${message(e)}`);
    }
  }

  return {
    site: cfg.siteUrl,
    model: cfg.ai.model,
    mode: grounded ? 'grounded' : 'plain',
    note,
    results,
    skipped,
    skippedReason,
    usedToday: usage.count,
    dailyCap: cfg.ai.dailyCap,
  };
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
  if (file.note) console.log(file.note);
  if (file.skippedReason) console.log(file.skippedReason);
  console.log(`${file.results.length} answers (${file.mode}), ${file.skipped} skipped -> ${aiCheckPath(run)}`);
  if (!existsSync(aiCheckPath(run))) throw new Error('ai-check.json was not written');
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
