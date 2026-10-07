#!/usr/bin/env node
/**
 * Pull the last 28 days and the 28 days before from Search Console into
 * sites/<domain>/data/. Cached by date range; re-running the same day is free.
 *
 *   node scripts/gsc-pull.ts --site example.com
 */
import { parseArgs, flagString } from './lib/args.ts';
import { getAuth } from './lib/auth.ts';
import { loadConfig } from './lib/config.ts';
import { pullWindow, windows } from './lib/gsc.ts';
import { dataDir, siteDir } from './lib/paths.ts';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const domain = flagString(args, 'site');
  if (!domain) throw new Error('Usage: node scripts/gsc-pull.ts --site <domain>');
  const site = siteDir(process.cwd(), domain);
  const cfg = loadConfig(site);
  const auth = getAuth();
  const w = windows();
  for (const [label, win] of [
    ['current', w.current],
    ['prior', w.prior],
  ] as const) {
    const r = await pullWindow(auth, cfg.siteUrl, win, dataDir(site));
    console.log(`${label} ${win.start}..${win.end}: ${r.rows.length} rows ${r.fromCache ? '(cached)' : '(pulled)'} -> ${r.file}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
