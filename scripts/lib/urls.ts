/**
 * Search Console reports `/page`, `/page/`, `/page?utm=x` and `/page#top` as four
 * pages. The owner edits one template, so the pipeline collapses them before any
 * counting happens.
 */
export function normalisePage(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return url.replace(/[?#].*$/, '').replace(/(.)\/+$/, '$1');
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** File-safe name for a page: `https://x/blog/a-b/` -> `blog-a-b`, root -> `index`. */
export function slugFor(url: string): string {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    path = url;
  }
  const slug = path
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (slug || 'index').slice(0, 80);
}

/** Words from a URL path, used as a fallback when a page has no title or H1. */
export function slugWords(url: string): string[] {
  return slugFor(url)
    .split('-')
    .filter((w) => w && w !== 'index');
}
