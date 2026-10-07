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
  // "how to X" starts with a question word but reads as an instruction; a person asks "How do I X?".
  const howTo = /^how to (.+)$/i.exec(q);
  if (howTo) return `How do I ${howTo[1]}?`;

  if (isQuestion(q)) return capitalise(q) + '?';

  const costTo = /^cost (?:to|of) (.+)$/i.exec(q);
  if (costTo) return `How much does it cost to ${costTo[1]}?`;

  const cost = /^(.+?)\s+(cost|costs|price|prices|pricing)$/i.exec(q);
  if (cost) return `How much does ${cost[1]} cost?`;

  const best = /^best (.+)$/i.exec(q);
  if (best) return `What is the best ${best[1]}?`;

  const near = /^(.+?)\s+near me$/i.exec(q);
  if (near) return `Who offers ${near[1]} near me?`;

  const vs = /^(.+?)\s+vs\.?\s+(.+)$/i.exec(q);
  if (vs) return `Should I choose ${vs[1]} or ${vs[2]}?`;

  // Someone searching "water heater leaking" or "no hot water" has a problem, not a curiosity.
  if (/\b(leak|leaking|clog|clogged|not working|won't|wont|keeps|no hot water|broken|not heating|running constantly|smell|noise|overflow|backing up|stuck|tripping)\b/i.test(q)) {
    return `${capitalise(q)}. What should I do?`;
  }

  const template = /^(.+?)\s+(template|templates|example|examples|wording|sample|samples)$/i.exec(q);
  if (template) return `Can you give me a ${template[1]} ${template[2].replace(/s$/, '')}?`;

  const policy = /^(.+?)\s+policy$/i.exec(q);
  if (policy) return `What should a ${policy[1]} policy say?`;

  if (/\b(software|app|apps|tool|tools|platform|system)$/i.test(q)) return `What is a good ${q}?`;

  return `What should I know about ${q}?`;
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
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Tiny stemmer: strips a plural or verb ending and a doubled consonant, so that
 * clogging, clogged and clogs all become clog. Enough to compare a query with a page
 * without pulling in a stemming library.
 */
export function stem(w: string): string {
  let s = w;
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && /(s|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (/([b-df-hj-np-tv-z])\1$/.test(s)) s = s.slice(0, -1);
  return s;
}

/** Equal after stemming, or long words sharing their first five letters (replace, replacement). */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (stem(a) === stem(b)) return true;
  return a.length >= 6 && b.length >= 6 && a.slice(0, 5) === b.slice(0, 5);
}

export function overlapCount(queryTokens: string[], pageTokens: string[]): number {
  let n = 0;
  for (const q of queryTokens) if (pageTokens.some((p) => tokensMatch(q, p))) n++;
  return n;
}
