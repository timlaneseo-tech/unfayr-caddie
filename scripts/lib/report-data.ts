import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteHost } from './config.ts';
import { sitewideIssues, type Issue } from './sitewide.ts';
import type { AiCheckFile, CandidatesFile, GapsFile, MemoJson, PageExtract, ProposedChange, WeekTotals } from './types.ts';

/**
 * Everything the combined report needs, read from the files /find, /gaps and /monday
 * already write. Nothing here asks the writer for a second summary of their own work.
 */
export type Effort = '5 minutes' | 'About 30 minutes' | 'Ask your web provider';

export interface KeyFix {
  label: string;
  before: string | null;
  after: string;
}

export interface FindPage {
  rank: number;
  slug: string;
  title: string;
  url: string;
  clicks: number;
  oneLine: string;
  effort: Effort;
  why: string;
  keyFixes: KeyFix[];
  isRetire: boolean;
}

export interface Brief {
  slug: string;
  title: string;
  url: string;
  question: string;
  why: string;
  firstParagraph: string;
  isEdit: boolean;
}

export interface ReportData {
  host: string;
  date: string;
  find: null | {
    pages: FindPage[];
    totalQueries: number;
    brandQueries: number;
    window: { start: string; end: string };
    skipped: string[];
    aiMode: string | null;
    aiAsked: number;
    aiMentions: number;
    packFile: string;
  };
  gaps: null | { asked: number; open: number; briefs: Brief[]; skipped: string[] };
  monday: null | { thisWeek: WeekTotals; lastWeek: WeekTotals; ga4: MemoJson['ga4']; weekParagraph: string; threeThings: string[]; suggestions: number; applied: number };
  sitewide: Issue[];
}

const readJson = <T>(f: string): T | null => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : null);

/** Split markdown into its "## " sections, ignoring headings inside fenced code blocks. */
export function mdSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  let fence = false;
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    const h = !fence && /^## (.+)$/.exec(line);
    if (h) {
      current = h[1].trim();
      out[current] = '';
    } else if (current !== null) out[current] += `${line}\n`;
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

function fences(text: string): { label: string; body: string }[] {
  const out: { label: string; body: string }[] = [];
  const re = /(?:^|\n)([^\n]*)\n```[^\n]*\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  const src = `\n${text}`;
  while ((m = re.exec(src))) out.push({ label: m[1].trim(), body: m[2].trim() });
  return out;
}

const firstPara = (s: string): string => s.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith('```')) ?? '';

/** "### 1. Title" chunks of a Fixes section, each reduced to its before and after text. */
export function keyFixes(fixesSection: string, limit = 2): KeyFix[] {
  const chunks: { label: string; text: string }[] = [];
  let fence = false;
  for (const line of fixesSection.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    const h = !fence && /^### \d+\.\s*(.+)$/.exec(line);
    if (h) chunks.push({ label: h[1].trim(), text: '' });
    else if (chunks.length) chunks[chunks.length - 1].text += `${line}\n`;
  }
  const out: KeyFix[] = [];
  for (const c of chunks) {
    const f = fences(c.text).filter((x) => !/^\{/.test(x.body));
    if (!f.length) continue;
    const before = f.find((x) => /^Before/i.test(x.label));
    const after = f.find((x) => /^After/i.test(x.label)) ?? f.find((x) => x !== before) ?? f[0];
    out.push({ label: c.label, before: before && !/^\(none\)/.test(before.body) && before !== after ? before.body : null, after: after.body });
    if (out.length >= limit) break;
  }
  return out;
}

export function effortFor(kinds: string[], text: string): Effort {
  if (kinds.some((k) => k === 'redirect' || k === 'schema') || /\b(template|Dealer Spike|web provider|developer|support)\b/i.test(text)) return 'Ask your web provider';
  if (kinds.some((k) => k === 'h2' || k === 'answer' || k === 'faq' || k === 'faq-jsonld' || k === 'new-page')) return 'About 30 minutes';
  return '5 minutes';
}

function readmeOneLiner(readme: string, slug: string): string {
  const line = readme.split('\n').find((l) => l.includes(`[${slug}](${slug}.md)`));
  const cells = line?.split('|').map((c) => c.trim()) ?? [];
  const cell = cells[cells.length - 2] ?? '';
  return cell === '_pending_' ? '' : cell.replace(/\[[^\]]*\]\([^)]*\)\s*/g, '').trim();
}

function loadFind(dir: string, host: string, date: string): ReportData['find'] {
  const cand = readJson<CandidatesFile>(join(dir, 'candidates.json'));
  if (!cand) return null;
  const readme = existsSync(join(dir, 'README.md')) ? readFileSync(join(dir, 'README.md'), 'utf8') : '';
  const changes = readJson<ProposedChange[]>(join(dir, 'changes.json')) ?? [];
  const ai = readJson<AiCheckFile>(join(dir, 'ai-check.json'));
  const pages: FindPage[] = [];
  cand.pages.forEach((p, i) => {
    const f = join(dir, `${p.slug}.md`);
    if (!existsSync(f)) return;
    const md = readFileSync(f, 'utf8');
    const s = mdSections(md);
    const mine = changes.filter((c) => c.page === p.page);
    pages.push({
      rank: i + 1,
      slug: p.slug,
      title: /^# (.+)$/m.exec(md)?.[1].trim() ?? p.slug,
      url: p.page,
      clicks: p.score,
      oneLine: readmeOneLiner(readme, p.slug),
      effort: effortFor(mine.map((c) => c.kind), s.Fixes ?? ''),
      why: firstPara(s['Why it sits here'] ?? ''),
      keyFixes: keyFixes(s.Fixes ?? ''),
      isRetire: mine.some((c) => c.kind === 'redirect'),
    });
  });
  pages.sort((a, b) => b.clicks - a.clicks || a.rank - b.rank);
  const ok = (ai?.results ?? []).filter((r) => !r.error);
  return {
    pages,
    totalQueries: cand.totalQueries,
    brandQueries: cand.brandQueries,
    window: cand.window,
    skipped: [...cand.skipped, ...(ai?.skippedReason ? [ai.skippedReason] : [])],
    aiMode: ai?.mode ?? null,
    aiAsked: ok.length,
    aiMentions: ok.filter((r) => r.mentionsSite || r.onSite).length,
    packFile: `Implementation Pack - ${host} - ${date}.pdf`,
  };
}

function loadGaps(dir: string): ReportData['gaps'] {
  const g = readJson<GapsFile>(join(dir, 'gaps.json'));
  if (!g) return null;
  const readme = existsSync(join(dir, 'README.md')) ? readFileSync(join(dir, 'README.md'), 'utf8') : '';
  const linked = [...readme.matchAll(/\]\(([^)]+)\.md\)/g)].map((m) => m[1]);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.slice(0, -3));
  const order = [...new Set([...linked.filter((s) => files.includes(s)), ...files])];
  const briefs = order.map((slug): Brief => {
    const md = readFileSync(join(dir, `${slug}.md`), 'utf8');
    const s = mdSections(md);
    const h1 = /^# (.+)$/m.exec(md)?.[1].trim() ?? slug;
    const isEdit = /^Edit:/i.test(h1);
    const after = fences(s['The edit'] ?? '').find((x) => /^After/i.test(x.label));
    const fp = s['First paragraph'] ?? '';
    return {
      slug,
      title: h1.replace(/^Edit:\s*/i, ''),
      url: (/^URL:\s*(\S+)/m.exec(md)?.[1] ?? '').trim(),
      question: (/^Question:\s*([^\n(]+?\?)/m.exec(md)?.[1] ?? '').trim(),
      why: firstPara(s['Why it is a gap'] ?? ''),
      firstParagraph: (isEdit ? after?.body.replace(/^## .+\n+/, '') : (fences(fp)[0]?.body ?? firstPara(fp))) ?? '',
      isEdit,
    };
  });
  return { asked: g.gaps.length + g.covered.length, open: g.gaps.length, briefs, skipped: g.skipped };
}

function loadMonday(dir: string): ReportData['monday'] {
  const m = readJson<MemoJson>(join(dir, 'memo.json'));
  if (!m) return null;
  const memo = existsSync(join(dir, 'memo.md')) ? readFileSync(join(dir, 'memo.md'), 'utf8') : '';
  const s = mdSections(memo);
  const things = (s['Three things to do this week'] ?? '').split('\n').filter((l) => /^\d+\.\s/.test(l)).map((l) => l.replace(/^\d+\.\s*/, '').trim());
  return {
    thisWeek: m.thisWeek,
    lastWeek: m.lastWeek,
    ga4: m.ga4,
    weekParagraph: firstPara(s['The week in one paragraph'] ?? ''),
    threeThings: things,
    suggestions: m.changes.length,
    applied: m.changes.filter((c) => c.status === 'applied').length,
  };
}

function loadExtracts(dir: string): PageExtract[] {
  const p = join(dir, 'pages');
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(p, f), 'utf8')) as PageExtract);
}

export function loadReportData(siteDir: string, date: string): ReportData {
  const cfg = readJson<{ siteUrl: string }>(join(siteDir, 'config.json'));
  const runs = join(siteDir, 'runs', date);
  const cand = readJson<CandidatesFile>(join(runs, 'find', 'candidates.json'));
  const host = siteHost(cfg?.siteUrl ?? cand?.site ?? '');
  return {
    host,
    date,
    find: loadFind(join(runs, 'find'), host, date),
    gaps: loadGaps(join(runs, 'gaps')),
    monday: loadMonday(join(runs, 'monday')),
    sitewide: sitewideIssues(loadExtracts(join(runs, 'find'))),
  };
}
