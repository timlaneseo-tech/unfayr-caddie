import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SiteConfig } from './types.ts';

/**
 * Turn a Search Console property id into a folder name.
 * "sc-domain:example.com" -> "example.com"; "https://www.example.com/" -> "www.example.com".
 */
export function domainFromSiteUrl(siteUrl: string): string {
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice('sc-domain:'.length).toLowerCase();
  try {
    const u = new URL(siteUrl);
    const path = u.pathname.replace(/\/+$/, '').replace(/\//g, '-');
    return (u.hostname + path).toLowerCase();
  } catch {
    return siteUrl.replace(/[^a-z0-9.-]+/gi, '-').toLowerCase();
  }
}

/** The host a page URL must sit on to count as "on site". Drops a leading www. */
export function siteHost(siteUrl: string): string {
  const d = domainFromSiteUrl(siteUrl).split('-')[0];
  return d.replace(/^www\./, '');
}

export function defaultConfig(siteUrl: string): SiteConfig {
  return {
    siteUrl,
    domain: domainFromSiteUrl(siteUrl),
    brandTerms: [],
    locale: 'en-US',
    thresholds: {
      positionMin: 4,
      positionMax: 15,
      minImpressions: 20,
      maxPages: 25,
      brandCtr: 0.4,
      queriesPerPageForAi: 3,
    },
    ai: {
      model: 'gemini-2.5-flash',
      dailyCap: 1000,
    },
  };
}

export function configPath(siteDir: string): string {
  return join(siteDir, 'config.json');
}

export function loadConfig(siteDir: string): SiteConfig {
  const p = configPath(siteDir);
  if (!existsSync(p)) {
    throw new Error(`No config.json at ${p}. Run \`node scripts/sites.ts\` to create one.`);
  }
  const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<SiteConfig>;
  const base = defaultConfig(raw.siteUrl ?? '');
  // Merge shallowly so a hand-edited config missing a new threshold still works.
  return {
    ...base,
    ...raw,
    thresholds: { ...base.thresholds, ...(raw.thresholds ?? {}) },
    ai: { ...base.ai, ...(raw.ai ?? {}) },
  };
}

export function saveConfig(siteDir: string, cfg: SiteConfig): void {
  mkdirSync(siteDir, { recursive: true });
  writeFileSync(configPath(siteDir), JSON.stringify(cfg, null, 2) + '\n');
}
