/**
 * Brand queries are marked, never dropped: they still appear in the queries table so
 * the owner sees them, but the writer spends no effort on them because the site
 * already wins those searches and no page edit changes that.
 */

const GENERIC_LABEL_TOKENS = new Set([
  'www', 'the', 'and', 'com', 'net', 'org', 'blog', 'shop', 'app', 'online', 'site', 'web',
  'inc', 'llc', 'ltd', 'co', 'group', 'services', 'service', 'solutions', 'company',
]);

/**
 * Candidate brand tokens from the domain plus configured terms, lowercased.
 * "summitplumbing.example" -> ["summitplumbing"]; "summit-plumbing.co.uk" -> ["summit-plumbing", "summit", "plumbing"].
 * Single short tokens (< 3 chars) and generic words are dropped because they would
 * match far too many ordinary queries.
 */
export function brandTokens(domain: string, configured: string[]): string[] {
  const out = new Set<string>();
  const host = domain.toLowerCase().replace(/^www\./, '');
  const labels = host.split('.');
  // The registrable label is the first one; skip public suffixes like "co.uk".
  const label = labels[0] ?? '';
  if (label.length >= 3 && !GENERIC_LABEL_TOKENS.has(label)) out.add(label);
  for (const part of label.split(/[^a-z0-9]+/)) {
    if (part.length >= 3 && !GENERIC_LABEL_TOKENS.has(part)) out.add(part);
  }
  for (const term of configured) {
    const t = term.trim().toLowerCase();
    if (t.length >= 3) out.add(t);
  }
  return [...out];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A query is brand when it contains a brand token, or when the heuristic fires: the
 * site sits at position 1-2 with a CTR far above what any non-brand result earns.
 * Tokens of 5+ characters may also match inside a longer word ("summitplumbingreviews"),
 * because people run brand names together; shorter tokens must match whole words.
 */
export function isBrandQuery(
  query: string,
  tokens: string[],
  stat: { position: number; ctr: number },
  brandCtr: number,
): boolean {
  const q = query.toLowerCase();
  for (const t of tokens) {
    if (t.length >= 5 && q.includes(t)) return true;
    if (new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}([^a-z0-9]|$)`).test(q)) return true;
  }
  return stat.position <= 2 && stat.ctr >= brandCtr;
}
