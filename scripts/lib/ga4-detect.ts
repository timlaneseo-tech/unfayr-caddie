/**
 * Find a site's GA4 property without asking the owner for a number they have never seen.
 * The home page usually carries the G- measurement ID; when the tag loads through Google
 * Tag Manager it does not, and the property is matched by its web stream's website URL.
 */
export interface Ga4PropertyRow {
  propertyId: string;
  measurementIds: string[];
  streamUris: string[];
}

export function measurementIds(html: string): string[] {
  return [...new Set(html.match(/\bG-[A-Z0-9]{6,12}\b/g) ?? [])];
}

function bareHost(s: string): string {
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return s.toLowerCase().replace(/^www\./, '');
  }
}

export function resolveGa4(ids: string[], host: string, props: Ga4PropertyRow[]): string | null {
  const byId = props.find((p) => p.measurementIds.some((m) => ids.includes(m)));
  if (byId) return byId.propertyId;
  const want = bareHost(host);
  const byHost = props.find((p) => p.streamUris.some((u) => bareHost(u) === want));
  return byHost?.propertyId ?? null;
}
