import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CREDIT } from './readme.ts';
import { classifyChange } from './status.ts';
import type { ChangeReport, DateWindow, Ga4PageRow, GscRow, LedgerEntry, MemoJson, PageExtract, PageMove, WeekTotals } from './types.ts';
import { normalisePage } from './urls.ts';
import { pageMoves, positionFor, weekTotals } from './weeks.ts';

export interface MemoInput {
  site: string;
  date: string;
  thisWeek: DateWindow;
  lastWeek: DateWindow;
  thisRows: GscRow[];
  lastRows: GscRow[];
  ledger: LedgerEntry[];
  /** Current extract for every page the ledger mentions, keyed by page URL. */
  extracts: Map<string, PageExtract>;
  ga4: { propertyId: string; pages: Ga4PageRow[] } | null;
  minImpressions: number;
}

export function buildMemo(input: MemoInput): MemoJson {
  const notes: string[] = [];
  const changes: ChangeReport[] = input.ledger.map((e) => {
    const ex = input.extracts.get(e.page);
    const c = ex ? classifyChange(e, ex) : { status: 'unknown' as const, detail: 'page not fetched' };
    return {
      id: e.id,
      page: e.page,
      kind: e.kind,
      summary: e.summary,
      proposedOn: e.date,
      appliedOn: c.status === 'applied' ? (e.appliedOn ?? input.date) : (e.appliedOn ?? null),
      status: c.status,
      statusDetail: c.detail,
      queries: e.queries.map((q) => ({
        query: q,
        atProposal: e.queryPositions?.[q] ?? e.positionAtTime,
        lastWeek: positionFor(input.lastRows, q, e.page),
        thisWeek: positionFor(input.thisRows, q, e.page),
      })),
    };
  });

  const ledgerPages = new Set(input.ledger.map((e) => normalisePage(e.page)));
  const moves = pageMoves(input.thisRows, input.lastRows, { minImpressions: input.minImpressions, exclude: ledgerPages });

  if (input.ledger.length === 0) notes.push('The ledger is empty: no /find run has recorded suggestions yet, so there is nothing to follow up.');
  const sameDay = input.ledger.filter((e) => e.date === input.date).length;
  if (sameDay) notes.push(`${sameDay} suggestion(s) were proposed today; expect them to read as unchanged until the edits are made and movement takes two to four weeks to show.`);
  if (!input.ga4) notes.push('GA4 not configured (no ga4PropertyId in config.json), so the memo has no sessions or conversions.');

  return {
    site: input.site,
    date: input.date,
    thisWeek: weekTotals(input.thisRows, input.thisWeek),
    lastWeek: weekTotals(input.lastRows, input.lastWeek),
    changes,
    moversUp: moves.up,
    moversDown: moves.down,
    ga4: input.ga4,
    notes,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function pct(a: number, b: number): string {
  if (!b) return a ? 'new' : '0%';
  const d = Math.round(((a - b) / b) * 100);
  return `${d > 0 ? '+' : ''}${d}%`;
}

function pos(n: number | null): string {
  return n === null ? '–' : n.toFixed(1);
}

function totalsRow(label: string, t: WeekTotals, prev: WeekTotals | null): string {
  const delta = (a: number, b: number) => (prev ? ` (${pct(a, b)})` : '');
  return `| ${label} | ${t.start} to ${t.end} | ${fmt(t.clicks)}${delta(t.clicks, prev?.clicks ?? 0)} | ${fmt(t.impressions)}${delta(t.impressions, prev?.impressions ?? 0)} | ${(t.ctr * 100).toFixed(1)}% | ${t.position.toFixed(1)}${prev ? ` (${(prev.position - t.position) > 0 ? '+' : ''}${(prev.position - t.position).toFixed(1)})` : ''} |`;
}

function moversTable(moves: PageMove[]): string {
  if (!moves.length) return '_None above the impressions floor._\n';
  const lines = ['| Page | Impressions | Last week | This week | Change | Top query |', '|------|------------:|----------:|----------:|-------:|-----------|'];
  for (const m of moves) lines.push(`| ${m.page} | ${fmt(m.impressions)} | ${m.positionLast.toFixed(1)} | ${m.positionThis.toFixed(1)} | ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(1)} | ${m.topQuery} |`);
  return lines.join('\n') + '\n';
}

/** The deterministic half of the memo: every table Claude's prose will refer to. */
export function renderMemoReadme(m: MemoJson, runCommand: string): string {
  const L: string[] = [];
  L.push(`# /monday data: ${m.site}, ${m.date}`);
  L.push('');
  L.push('The numbers behind this week\'s memo. Claude writes `memo.md` from these; this file is the evidence.');
  L.push('');
  L.push('## Week over week (Search Console)');
  L.push('');
  L.push('| Week | Dates | Clicks | Impressions | CTR | Avg. position (change) |');
  L.push('|------|-------|-------:|------------:|----:|-----------------------:|');
  L.push(totalsRow('This week', m.thisWeek, m.lastWeek));
  L.push(totalsRow('Last week', m.lastWeek, null));
  L.push('');
  L.push('Position change is shown as an improvement when positive (a lower number is better).');
  L.push('');

  L.push('## What came of Caddie\'s suggestions');
  L.push('');
  if (!m.changes.length) {
    L.push('_The ledger is empty._');
  } else {
    const counts = m.changes.reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});
    L.push(Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') + '.');
    L.push('');
    L.push('| Status | Proposed | Page | Change | Queries: at proposal / last week / this week |');
    L.push('|--------|----------|------|--------|-----------------------------------------------|');
    for (const c of m.changes) {
      const qs = c.queries.map((q) => `${q.query}: ${pos(q.atProposal)} / ${pos(q.lastWeek)} / ${pos(q.thisWeek)}`).join('<br>');
      L.push(`| ${c.status}${c.appliedOn ? ` (${c.appliedOn})` : ''} | ${c.proposedOn} | ${c.page.replace(/^https?:\/\//, '')} | ${c.summary.replace(/\|/g, '\\|')} | ${qs} |`);
    }
    L.push('');
    L.push('Status is decided by re-fetching the page: applied means the proposed text is on it, changed means the page changed but that text was not found, unchanged means the content hash matches the day it was proposed, gone means the page no longer loads.');
  }
  L.push('');

  L.push('## Pages that moved on their own');
  L.push('');
  L.push('Not in the ledger; impression-weighted position across all their queries, at least one position of movement and the impressions floor applied.');
  L.push('');
  L.push('### Up');
  L.push('');
  L.push(moversTable(m.moversUp));
  L.push('### Down');
  L.push('');
  L.push(moversTable(m.moversDown));

  L.push('## GA4 landing pages');
  L.push('');
  if (!m.ga4) {
    L.push('_Not configured. Add `ga4PropertyId` to config.json to include sessions and key events._');
  } else {
    L.push(`Property ${m.ga4.propertyId}. Top landing pages by sessions this week, with last week beside them.`);
    L.push('');
    L.push('| Landing page | Sessions | Last week | Engaged | Key events | Last week |');
    L.push('|--------------|---------:|----------:|--------:|-----------:|----------:|');
    for (const r of m.ga4.pages.slice(0, 15)) L.push(`| ${r.path} | ${fmt(r.sessionsThis)} | ${fmt(r.sessionsLast)} (${pct(r.sessionsThis, r.sessionsLast)}) | ${fmt(r.engagedThis)} | ${fmt(r.keyEventsThis)} | ${fmt(r.keyEventsLast)} |`);
  }
  L.push('');

  if (m.notes.length) {
    L.push('## Notes');
    L.push('');
    for (const n of m.notes) L.push(`- ${n}`);
    L.push('');
  }

  L.push('## Run again');
  L.push('');
  L.push('```');
  L.push(runCommand);
  L.push('```');
  L.push('');
  L.push(CREDIT);
  L.push('');
  return L.join('\n');
}

export function writeMemoFiles(runDir: string, memo: MemoJson, runCommand: string): void {
  writeFileSync(join(runDir, 'memo.json'), JSON.stringify(memo, null, 2));
  writeFileSync(join(runDir, 'README.md'), renderMemoReadme(memo, runCommand));
}
