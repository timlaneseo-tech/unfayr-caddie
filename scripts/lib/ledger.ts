import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CHANGE_KINDS, type CandidatesFile, type Ledger, type LedgerEntry, type PageExtract, type ProposedChange } from './types.ts';
import { slugFor } from './urls.ts';

/**
 * The ledger is the plugin's memory. Every change /find proposes lands here with the
 * page's content hash at the time, so /monday can later tell whether the page was
 * actually edited and what the positions did afterwards.
 */
export function ledgerPath(siteDir: string): string {
  return join(siteDir, 'ledger.json');
}

export function loadLedger(siteDir: string, site: string): Ledger {
  const p = ledgerPath(siteDir);
  if (!existsSync(p)) return { site, entries: [] };
  return JSON.parse(readFileSync(p, 'utf8')) as Ledger;
}

export function saveLedger(siteDir: string, ledger: Ledger): void {
  writeFileSync(ledgerPath(siteDir), JSON.stringify(ledger, null, 2) + '\n');
}

/** Stable id so recording the same run twice adds nothing. */
export function entryId(e: Pick<LedgerEntry, 'page' | 'kind' | 'date' | 'summary'>): string {
  return createHash('sha1').update([e.page, e.kind, e.date, e.summary].join('|')).digest('hex').slice(0, 12);
}

export function appendEntries(ledger: Ledger, entries: LedgerEntry[]): { ledger: Ledger; added: number; duplicates: number } {
  const have = new Set(ledger.entries.map((e) => e.id));
  let added = 0;
  let duplicates = 0;
  for (const e of entries) {
    if (have.has(e.id)) {
      duplicates++;
      continue;
    }
    have.add(e.id);
    ledger.entries.push(e);
    added++;
  }
  return { ledger, added, duplicates };
}

export function validateChanges(raw: unknown): ProposedChange[] {
  if (!Array.isArray(raw)) throw new Error('changes.json must be a JSON array of { page, kind, queries, summary }');
  return raw.map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    if (typeof o.page !== 'string' || !o.page) throw new Error(`changes.json entry ${i}: "page" must be a URL string`);
    if (typeof o.kind !== 'string' || !(CHANGE_KINDS as readonly string[]).includes(o.kind)) {
      throw new Error(`changes.json entry ${i}: "kind" must be one of ${CHANGE_KINDS.join(', ')} (got ${JSON.stringify(o.kind)})`);
    }
    if (!Array.isArray(o.queries) || !o.queries.every((q) => typeof q === 'string')) throw new Error(`changes.json entry ${i}: "queries" must be an array of strings`);
    if (typeof o.summary !== 'string' || !o.summary.trim()) throw new Error(`changes.json entry ${i}: "summary" must be a non-empty string`);
    return { page: o.page, kind: o.kind as ProposedChange['kind'], queries: o.queries as string[], summary: o.summary.trim() };
  });
}

/** The run date is the folder name under runs/. */
export function runDateFromDir(runDir: string): string {
  const m = /runs[\\/](\d{4}-\d{2}-\d{2})[\\/]/.exec(runDir + '/');
  if (!m) throw new Error(`Cannot find a runs/<date>/ segment in ${runDir}`);
  return m[1];
}

export function buildEntries(changes: ProposedChange[], candidates: CandidatesFile, extracts: Map<string, PageExtract>, date: string, run: string): LedgerEntry[] {
  return changes.map((c) => {
    const page = candidates.pages.find((p) => p.page === c.page);
    const stats = page ? page.queries.filter((q) => c.queries.includes(q.query)) : [];
    const positions = stats.map((q) => q.position);
    const base = { ...c, date, run };
    return {
      ...base,
      id: entryId(base),
      contentHash: extracts.get(c.page)?.contentHash ?? null,
      positionAtTime: positions.length ? Math.min(...positions) : null,
      impressionsAtTime: stats.reduce((s, q) => s + q.impressions, 0),
      status: 'proposed',
    };
  });
}

/**
 * A run's changes.json is the source of truth for that run. Recording replaces any
 * entries previously recorded from the same run folder, so editing a summary the same
 * day updates the ledger instead of leaving a stale twin behind.
 */
export function replaceRunEntries(ledger: Ledger, run: string): { ledger: Ledger; removed: number } {
  const before = ledger.entries.length;
  ledger.entries = ledger.entries.filter((e) => e.run !== run);
  return { ledger, removed: before - ledger.entries.length };
}

export function recordRun(siteDir: string, runDir: string): { added: number; replaced: number; total: number } {
  const changesFile = join(runDir, 'changes.json');
  if (!existsSync(changesFile)) throw new Error(`No changes.json in ${runDir}. The /find command writes it after the page files.`);
  const candidates = JSON.parse(readFileSync(join(runDir, 'candidates.json'), 'utf8')) as CandidatesFile;
  const changes = validateChanges(JSON.parse(readFileSync(changesFile, 'utf8')));
  const extracts = new Map<string, PageExtract>();
  for (const c of changes) {
    const f = join(runDir, 'pages', `${slugFor(c.page)}.json`);
    if (existsSync(f) && !extracts.has(c.page)) extracts.set(c.page, JSON.parse(readFileSync(f, 'utf8')) as PageExtract);
  }
  const date = runDateFromDir(runDir);
  const run = relative(siteDir, runDir).replace(/\\/g, '/');
  const loaded = loadLedger(siteDir, candidates.site);
  const { ledger, removed } = replaceRunEntries(loaded, run);
  const entries = buildEntries(changes, candidates, extracts, date, run);
  const r = appendEntries(ledger, entries);
  saveLedger(siteDir, r.ledger);
  return { added: r.added, replaced: removed, total: r.ledger.entries.length };
}
