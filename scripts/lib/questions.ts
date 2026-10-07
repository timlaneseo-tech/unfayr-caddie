/**
 * Query text helpers: is this query a question, how would a person ask it out loud,
 * and which words carry its meaning.
 */

const QUESTION_STARTS = /^(who|what|when|where|why|how|which|can|could|does|do|did|is|are|was|should|will|would)\b/i;

export function isQuestion(query: string): boolean {
  const q = query.trim();
  return q.endsWith('?') || QUESTION_STARTS.test(q);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * People do not type keywords into an assistant; they ask. The AI check phrases each
 * query the way its searcher would say it, so the grounded answer reflects what a
 * real user would see.
 */
export function toUserQuestion(query: string): string {
  let q = query.trim().replace(/\s+/g, ' ').replace(/\?+$/, '');
  if (isQuestion(q)) return capitalise(q) + '?';

  const howTo = /^how to (.+)$/i.exec(q);
  if (howTo) return `How do I ${howTo[1]}?`;

  const cost = /^(.+?)\s+(cost|costs|price|prices|pricing)$/i.exec(q);
  if (cost) return `How much does ${cost[1]} cost?`;

  const best = /^best (.+)$/i.exec(q);
  if (best) return `What is the best ${best[1]}?`;

  const near = /^(.+?)\s+near me$/i.exec(q);
  if (near) return `Who offers ${near[1]} near me?`;

  const vs = /^(.+?)\s+vs\.?\s+(.+)$/i.exec(q);
  if (vs) return `Should I choose ${vs[1]} or ${vs[2]}?`;

  return `Can you tell me about ${q}?`;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'is', 'are', 'was',
  'be', 'it', 'its', "it's", 'my', 'me', 'i', 'you', 'your', 'we', 'our', 'do', 'does', 'did', 'can', 'could',
  'should', 'will', 'would', 'how', 'what', 'why', 'when', 'where', 'who', 'which', 'near', 'vs', 'versus',
  'not', 'no', 'if', 'than', 'this', 'that', 'these', 'those', 'up', 'out', 'much', 'many', 'get', 'need',
  'guide', 'complete', 'here', 'what\'s', 'into',
]);

/** Lowercased words that carry meaning, with stopwords and punctuation removed. */
export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Loose match for "heater" vs "heaters", "booking" vs "booked": equal, or both at
 * least five letters and sharing the first five. Good enough to tell whether a page
 * title is about a query without pulling in a stemming library.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

export function overlapCount(queryTokens: string[], pageTokens: string[]): number {
  let n = 0;
  for (const q of queryTokens) if (pageTokens.some((p) => tokensMatch(q, p))) n++;
  return n;
}
