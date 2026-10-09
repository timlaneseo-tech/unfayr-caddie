#!/usr/bin/env node
/**
 * Gather the facts the guided run drafts the business card from, and write them to
 * sites/<domain>/profile.json.
 *
 *   node scripts/profile.ts --site <domain> [--cwd <dir>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchHtml, fetchPage } from './fetch-page.ts';
import { parseArgs, flagString } from './lib/args.ts';
import { getAuth } from './lib/auth.ts';
import { loadConfig } from './lib/config.ts';
import { extract } from './lib/extract.ts';
import { pullWindow, windows } from './lib/gsc.ts';
import { dataDir, siteDir } from './lib/paths.ts';
import { aboutLink, profileFacts } from './lib/profile.ts';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const domain = flagString(args, 'site');
  if (!domain) throw new Error('Usage: node scripts/profile.ts --site <domain> [--cwd <dir>]');
  const base = flagString(args, 'cwd') ? resolve(flagString(args, 'cwd') as string) : process.cwd();
  const dir = siteDir(base, domain);
  const cfg = loadConfig(dir);
  const homeUrl = cfg.siteUrl.startsWith('sc-domain:') ? `https://${cfg.siteUrl.slice('sc-domain:'.length)}/` : cfg.siteUrl;

  const raw = await fetchHtml(homeUrl);
  const home = raw.html ? extract(raw.html, homeUrl) : await fetchPage(homeUrl);
  const aboutUrl = raw.html ? aboutLink(raw.html, homeUrl) : null;
  const about = aboutUrl ? await fetchPage(aboutUrl) : null;

  const pulled = await pullWindow(getAuth(), cfg.siteUrl, windows().current, dataDir(dir));
  const totals = new Map<string, number>();
  for (const r of pulled.rows) if (r.query) totals.set(r.query, (totals.get(r.query) ?? 0) + r.impressions);
  const queries = [...totals].map(([query, impressions]) => ({ query, impressions }));

  const profile = { homeUrl, aboutUrl, ...profileFacts(home, about, queries) };
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'profile.json');
  writeFileSync(out, JSON.stringify(profile, null, 2) + '\n');
  console.log(`Profile facts: ${profile.names.length} name(s), ${profile.addresses.length} address(es), ${profile.brands.length} brand(s), ${profile.topQueries.length} top queries.`);
  console.log(out);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
