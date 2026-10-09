import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clientPath, tokenPath } from './auth.ts';
import { clientType } from './client-install.ts';
import { domainFromSiteUrl } from './config.ts';
import { geminiKey, prefs } from './gemini-key.ts';
import { matchProperty } from './match.ts';
import { siteDir } from './paths.ts';
import type { SiteConfig } from './types.ts';

/**
 * What is set up and what the guided run should do next. The /caddie command reads this
 * before every step instead of guessing, which is what lets a returning user go straight
 * to the runs and a new user resume setup exactly where they stopped.
 */
export type NextStep = 'node' | 'deps' | 'client' | 'signin' | 'site' | 'profile' | 'gemini' | 'ready';

export interface DoctorDeps {
  nodeVersion: string;
  pluginRoot: string;
  home: string;
  site?: string;
  listProperties: () => Promise<string[]>;
}

export interface Doctor {
  node: { version: string; ok: boolean };
  deps: boolean;
  home: string;
  client: { path: string; type: 'installed' | 'web' | 'invalid' | null };
  signin: { ok: boolean; properties: string[]; error?: string };
  site: null | {
    input: string;
    siteUrl: string | null;
    reason: string;
    domain: string | null;
    configExists: boolean;
    brandTerms: boolean;
    notes: boolean;
    market: boolean;
    ga4PropertyId: string | null;
  };
  gemini: { keySet: boolean; source: 'env' | 'file' | null; offered: boolean; mode: string | null };
  next: NextStep;
}

export const MIN_NODE: [number, number] = [22, 18];

function nodeOk(version: string): boolean {
  const [maj, min] = version.replace(/^v/, '').split('.').map(Number);
  return maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1]);
}

export async function diagnose(d: DoctorDeps): Promise<Doctor> {
  const node = { version: d.nodeVersion, ok: nodeOk(d.nodeVersion) };
  const deps = existsSync(join(d.pluginRoot, 'node_modules'));
  const client = { path: clientPath(), type: clientType(clientPath()) };

  let signin: Doctor['signin'] = { ok: false, properties: [] };
  if (client.type === 'installed' && existsSync(tokenPath())) {
    try {
      signin = { ok: true, properties: await d.listProperties() };
    } catch (e) {
      signin = { ok: false, properties: [], error: e instanceof Error ? e.message : String(e) };
    }
  }

  let site: Doctor['site'] = null;
  let cfg: SiteConfig | null = null;
  if (d.site && signin.ok) {
    const m = matchProperty(d.site, signin.properties);
    const domain = m.siteUrl ? domainFromSiteUrl(m.siteUrl) : null;
    const file = domain ? join(siteDir(d.home, domain), 'config.json') : null;
    if (file && existsSync(file)) cfg = JSON.parse(readFileSync(file, 'utf8')) as SiteConfig;
    site = {
      input: d.site,
      siteUrl: m.siteUrl,
      reason: m.reason,
      domain,
      configExists: !!cfg,
      brandTerms: !!cfg?.brandTerms?.length,
      notes: !!cfg?.notes?.length,
      market: !!cfg?.market,
      ga4PropertyId: cfg?.ga4PropertyId ?? null,
    };
  }

  const key = geminiKey();
  const gemini = { keySet: !!key.key, source: key.source, offered: !!prefs().geminiOffered, mode: cfg?.ai?.mode ?? null };

  let next: NextStep = 'ready';
  if (!node.ok) next = 'node';
  else if (!deps) next = 'deps';
  else if (client.type !== 'installed') next = 'client';
  else if (!signin.ok) next = 'signin';
  else if (site && !site.configExists) next = 'site';
  else if (site && !site.brandTerms) next = 'profile';
  else if (!gemini.keySet && !gemini.offered) next = 'gemini';

  return { node, deps, home: d.home, client, signin, site, gemini, next };
}
