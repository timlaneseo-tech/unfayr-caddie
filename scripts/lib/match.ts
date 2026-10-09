/**
 * Turn whatever the owner typed ("example.com", "www.example.com", a full URL) into the
 * Search Console property that holds its data. A domain property covers every host and
 * protocol under it, so it wins over a URL-prefix property when both exist.
 */
function host(input: string): string {
  const s = input.trim().toLowerCase();
  try {
    return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return s.replace(/^https?:\/\//, '').split('/')[0];
  }
}

const bare = (h: string): string => h.replace(/^www\./, '');

export function matchProperty(input: string, properties: string[]): { siteUrl: string | null; reason: string } {
  const h = host(input);
  const domain = properties.find((p) => {
    if (!p.startsWith('sc-domain:')) return false;
    const d = p.slice('sc-domain:'.length).toLowerCase();
    return h === d || h.endsWith(`.${d}`);
  });
  if (domain) return { siteUrl: domain, reason: `domain property ${domain}` };
  const prefix = properties.find((p) => !p.startsWith('sc-domain:') && bare(host(p)) === bare(h));
  if (prefix) return { siteUrl: prefix, reason: `URL-prefix property ${prefix}` };
  if (properties.length === 0) return { siteUrl: null, reason: 'This Google account has no Search Console properties.' };
  return { siteUrl: null, reason: `No Search Console property for ${h}. This Google account can see: ${properties.join(', ')}.` };
}
