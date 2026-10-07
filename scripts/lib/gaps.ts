import { aggregate } from './gsc.ts';
import { contentTokens, isOperatorQuery, isQuestion, overlapCount, toUserQuestion } from './questions.ts';
import type { AiCheckFile, DateWindow, GapQuestion, GapScore, GscRow, PageExtract, QuestionsFile, SiteConfig } from './types.ts';
import { normalisePage, slugWords } from './urls.ts';

/**
 * Templates turn a market topic into the questions buyers ask about it. They are kept
 * short and generic on purpose: the point is coverage of intents (cost, comparison,
 * worth, choice, definition), not clever phrasing; Search Console supplies the real
 * wording wherever it has it.
 */
export const TEMPLATES: ((topic: string) => string)[] = [
  (t) => `how much does ${t} cost`,
  (t) => `what is ${t}`,
  (t) => `is ${t} worth it`,
  (t) => `how to choose ${t}`,
  (t) => `${t} vs alternatives`,
];

export const DEFAULT_MAX_QUESTIONS = 40;
export const DEFAULT_MAX_BRIEFS = 8;

/**
 * The kind of answer a question wants. Content tokens drop "is", "what" and "how", so
 * "what is X" and "is X worth it" look alike by words alone; the class keeps them apart.
 */
export function intentClass(q: string): string {
  const s = q.toLowerCase();
  if (/\b(cost|costs|price|prices|pricing|how much|charge)\b/.test(s)) return 'cost';
  if (/^(what is|what are|what's|whats)\b/.test(s) || /\bmeaning\b/.test(s)) return 'definition';
  if (/\bworth\b/.test(s)) return 'worth';
  if (/\b(vs|versus|alternative|alternatives|compare|comparison|better than|or)\b/.test(s)) return 'comparison';
  if (/\b(choose|best|which|pick|should i)\b/.test(s)) return 'choice';
  if (/^how (to|do|can)\b/.test(s)) return 'howto';
  if (/^(where|who|when)\b/.test(s)) return 'locate';
  return 'other';
}

/** Two queries are one intent when their content tokens mostly overlap and they want the same kind of answer. */
export function sameIntent(a: string, b: string): boolean {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (!ta.length || !tb.length) return false;
  if (intentClass(a) !== intentClass(b)) return false;
  const o = overlapCount(ta, tb);
  return o / Math.max(ta.length, tb.length) >= 0.75;
}

export interface BuildOptions {
  window: DateWindow;
  userQuestions?: string[];
  now?: Date;
}

/**
 * Build the question list: question-form Search Console queries (any position) clustered
 * by intent, then topic templates, then the owner's own list, capped. Search Console
 * questions come first because they carry impressions, the one number that says people
 * actually ask them.
 */
export function buildQuestions(rows: GscRow[], cfg: SiteConfig, opts: BuildOptions): QuestionsFile {
  const market = cfg.market;
  const max = market?.maxQuestions ?? DEFAULT_MAX_QUESTIONS;
  const skipped: string[] = [];
  const out: GapQuestion[] = [];

  // Search Console: question-form queries, summed across pages, best page by impressions.
  const agg = aggregate(rows, normalisePage);
  const byQuery = new Map<string, { impressions: number; posWeight: number; bestPage: string | null; bestImp: number }>();
  for (const a of agg.values()) {
    if (isOperatorQuery(a.query) || !isQuestion(a.query)) continue;
    const q = byQuery.get(a.query) ?? { impressions: 0, posWeight: 0, bestPage: null, bestImp: 0 };
    q.impressions += a.impressions;
    q.posWeight += a.position * a.impressions;
    if (a.impressions > q.bestImp) {
      q.bestImp = a.impressions;
      q.bestPage = a.page;
    }
    byQuery.set(a.query, q);
  }
  // One or two impressions in 28 days is a single person's search, not a market question.
  const floor = 3;
  const ranked = [...byQuery.entries()].filter(([, s]) => s.impressions >= floor).sort((x, y) => y[1].impressions - x[1].impressions);
  const dropped = byQuery.size - ranked.length;
  if (dropped) skipped.push(`${dropped} Search Console questions under ${floor} impressions ignored`);
  let folded = 0;
  for (const [query, s] of ranked) {
    const existing = out.find((o) => o.query && sameIntent(o.query, query));
    if (existing) {
      existing.variants.push(query);
      existing.impressions += s.impressions;
      folded++;
      continue;
    }
    out.push({
      question: toUserQuestion(query),
      source: 'search-console',
      query,
      impressions: s.impressions,
      position: s.impressions ? Math.round((s.posWeight / s.impressions) * 10) / 10 : null,
      rankingPage: s.bestPage,
      variants: [],
    });
  }
  if (folded) skipped.push(`${folded} Search Console questions folded into others as the same intent`);

  // Templates from the market topics.
  let templated = 0;
  for (const topic of market?.topics ?? []) {
    for (const make of TEMPLATES) {
      const q = make(topic.trim().toLowerCase());
      if (out.some((o) => o.query && sameIntent(o.query, q))) continue;
      out.push({ question: toUserQuestion(q), source: 'template', query: q, impressions: 0, position: null, rankingPage: null, variants: [] });
      templated++;
    }
  }
  if (!market?.topics?.length) skipped.push('No market.topics in config.json, so no template questions were added; add five or six phrases that define the market');

  // The owner's own questions, as written.
  for (const line of opts.userQuestions ?? []) {
    const q = line.trim();
    if (!q || q.startsWith('#')) continue;
    if (out.some((o) => sameIntent(o.question, q) || (o.query && sameIntent(o.query, q)))) continue;
    out.push({ question: q.endsWith('?') ? q : `${q}?`, source: 'user', impressions: 0, position: null, rankingPage: null, variants: [] });
  }

  // Order: impressions first, then user questions, then templates; cap.
  const rank = (q: GapQuestion) => (q.source === 'search-console' ? 2 : q.source === 'user' ? 1 : 0);
  out.sort((a, b) => rank(b) - rank(a) || b.impressions - a.impressions);
  const capped = out.slice(0, max);
  if (out.length > capped.length) skipped.push(`${out.length - capped.length} questions beyond the cap of ${max} (raise market.maxQuestions in config.json); ${templated} were template questions`);

  return { site: cfg.siteUrl, generatedAt: (opts.now ?? new Date()).toISOString(), window: opts.window, questions: capped, skipped };
}

function aboutTokens(ex: PageExtract): string[] {
  const t = contentTokens([ex.title ?? '', ex.h1 ?? '', ...ex.headings.map((h) => h.text)].join(' '));
  return t.length ? t : slugWords(ex.url);
}

/**
 * Does the site already have a page about this question? A page whose title, H1 or a
 * heading shares most of the question's content words counts; a page that merely ranks
 * for it does not, because ranking at position 14 on an unrelated page is the gap.
 */
export function findSitePage(q: GapQuestion, extracts: Map<string, PageExtract>): string | null {
  const qt = contentTokens(q.question);
  if (qt.length < 2) return null;
  let best: { url: string; ratio: number } | null = null;
  for (const ex of extracts.values()) {
    if (ex.status === 'failed') continue;
    const ratio = overlapCount(qt, aboutTokens(ex)) / qt.length;
    if (ratio >= 0.6 && (!best || ratio > best.ratio)) best = { url: ex.url, ratio };
  }
  return best?.url ?? null;
}

/**
 * Score a question as a gap. Impressions are demand; the rest are the reasons it is
 * open: no page about it, an AI answer that does not mention the site, competitors
 * named or cited. Questions with a page about them and an AI answer that names the
 * site are "covered" and listed separately.
 */
export function scoreGaps(questions: QuestionsFile, ai: AiCheckFile | null, extracts: Map<string, PageExtract>, cfg: SiteConfig): { gaps: GapScore[]; covered: GapScore[] } {
  const competitors = new Set((cfg.market?.competitors ?? []).map((c) => c.toLowerCase().replace(/^www\./, '')));
  const scored: GapScore[] = questions.questions.map((q) => {
    const sitePage = findSitePage(q, extracts);
    const r = ai?.results.find((x) => x.query === (q.query ?? q.question) || x.asked === q.question);
    const signals: string[] = [];
    const aiAnswered = !!r && !r.error && r.answer.length > 0;
    const aiMentionsSite = !!r?.mentionsSite;
    const aiCitesSite = !!r?.onSite;
    // "Home Depot" in prose should match homedepot.com, so compare letters only.
    const flat = (r?.answer ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const named = r ? [...competitors].filter((c) => flat.includes(c.split('.')[0].replace(/[^a-z0-9]/g, ''))) : [];
    const aiCompetitors = [...new Set([...(r?.competitors ?? []), ...named])];

    let score = Math.log10(q.impressions + 1) * 10;
    if (!sitePage) {
      score += 20;
      signals.push(q.rankingPage ? `ranks at ${q.position} on a page that is not about it` : 'no page on the site is about this');
    }
    if (aiAnswered && !aiMentionsSite) {
      score += 15;
      signals.push(ai?.mode === 'grounded' ? 'AI answer does not cite or mention the site' : 'AI answer does not mention the site');
    }
    if (aiCompetitors.length) {
      score += 10 + Math.min(10, aiCompetitors.length * 3);
      signals.push(`AI answer ${ai?.mode === 'grounded' ? 'cites' : 'names'} ${aiCompetitors.slice(0, 3).join(', ')}`);
    }
    if (q.source === 'template') score -= 5;
    // Covered: the site has a page about it, and the AI answer (when there is one) mentions the site.
    const isCovered = !!sitePage && (!aiAnswered || aiMentionsSite);
    if (isCovered) signals.push(aiAnswered ? 'covered: the site has a page about it and the AI answer mentions the site' : 'covered: the site has a page about it');
    if (sitePage && aiAnswered && !aiMentionsSite) signals.push(`the site's page (${sitePage.replace(/^https?:\/\/[^/]+/, '')}) is about this, so this is an edit, not a new page`);
    return { question: q, sitePage, aiAnswered, aiMentionsSite, aiCitesSite, aiCompetitors, signals, score: Math.round(score * 10) / 10 };
  });
  const covered = scored.filter((s) => s.signals.some((x) => x.startsWith('covered')));
  const gaps = scored.filter((s) => !s.signals.some((x) => x.startsWith('covered'))).sort((a, b) => b.score - a.score);
  return { gaps, covered };
}
