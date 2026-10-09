#!/usr/bin/env node
/**
 * List the Search Console properties this account can see and create a workspace
 * folder for one of them.
 *
 *   node scripts/sites.ts                     print the numbered list
 *   node scripts/sites.ts --pick 2            create sites/<domain>/config.json for row 2
 *   node scripts/sites.ts --site sc-domain:example.com   same, by property id
 *   node scripts/sites.ts --url example.com   same, matching what the owner typed to a property
 */
import { existsSync } from 'node:fs';
import { google } from 'googleapis';
import { parseArgs, flagString } from './lib/args.ts';
import { getAuth } from './lib/auth.ts';
import { defaultConfig, saveConfig } from './lib/config.ts';
import { siteDir } from './lib/paths.ts';
import { matchProperty } from './lib/match.ts';

interface Row {
  siteUrl: string;
  permission: string;
}

async function listSites(): Promise<Row[]> {
  const sc = google.searchconsole({ version: 'v1', auth: getAuth() });
  const res = await sc.sites.list();
  const rows = (res.data.siteEntry ?? [])
    .filter((s) => s.siteUrl)
    .map((s) => ({ siteUrl: s.siteUrl as string, permission: s.permissionLevel ?? '' }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
  return rows;
}

function printTable(rows: Row[]): void {
  if (rows.length === 0) {
    console.log('This Google account has no Search Console properties. Add one at https://search.google.com/search-console first.');
    return;
  }
  console.log('\n #  Property                                  Permission');
  rows.forEach((r, i) => {
    console.log(`${String(i + 1).padStart(2)}  ${r.siteUrl.padEnd(42)} ${r.permission}`);
  });
  console.log('\nPick one:  node scripts/sites.ts --pick <#>');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = await listSites();
  const pick = flagString(args, 'pick');
  const site = flagString(args, 'site');
  const url = flagString(args, 'url');

  let chosen: Row | undefined;
  if (pick) chosen = rows[Number(pick) - 1];
  else if (site) chosen = rows.find((r) => r.siteUrl === site);
  else if (url) {
    const m = matchProperty(url, rows.map((r) => r.siteUrl));
    if (!m.siteUrl) {
      console.error(m.reason);
      process.exit(1);
    }
    chosen = rows.find((r) => r.siteUrl === m.siteUrl);
  }

  if (!chosen) {
    if (pick || site) console.error(`No property matches ${pick ?? site}.`);
    printTable(rows);
    process.exit(pick || site ? 1 : 0);
  }

  if (chosen.permission === 'siteUnverifiedUser') {
    console.error(`${chosen.siteUrl} is unverified for this account; Search Console will return no data. Verify it first.`);
    process.exit(1);
  }

  const cfg = defaultConfig(chosen.siteUrl);
  const dir = siteDir(process.cwd(), cfg.domain);
  if (existsSync(dir)) {
    console.log(`${dir} already exists; leaving its config.json alone.`);
  } else {
    saveConfig(dir, cfg);
    console.log(`Created ${dir}/config.json`);
    console.log('Add your brand terms to "brandTerms" so the writer skips queries that are already yours.');
  }
  console.log(`Next: /find --site ${cfg.domain}   (or: node scripts/find.ts --site ${cfg.domain})`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
