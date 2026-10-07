#!/usr/bin/env node
/**
 * Record a run's proposed changes in sites/<domain>/ledger.json, or list the ledger.
 *
 *   node scripts/ledger.ts record --site example.com --run sites/example.com/runs/2026-10-07/find
 *   node scripts/ledger.ts list --site example.com
 *
 * Recording is idempotent: the same run recorded twice adds nothing.
 */
import { resolve } from 'node:path';
import { parseArgs, flagString } from './lib/args.ts';
import { loadLedger, recordRun } from './lib/ledger.ts';
import { siteDir } from './lib/paths.ts';

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args.positional[0];
  const domain = flagString(args, 'site');
  if (!domain || !cmd) throw new Error('Usage: node scripts/ledger.ts <record|list> --site <domain> [--run <dir>]');
  const site = siteDir(process.cwd(), domain);

  if (cmd === 'record') {
    const run = flagString(args, 'run');
    if (!run) throw new Error('record needs --run <dir>');
    const r = recordRun(site, resolve(run));
    console.log(`Ledger: ${r.added} recorded for this run${r.replaced ? ` (replacing ${r.replaced} from an earlier recording of it)` : ''}, ${r.total} entries total.`);
    return;
  }
  if (cmd === 'list') {
    const l = loadLedger(site, domain);
    if (l.entries.length === 0) {
      console.log('Ledger is empty. Run /find first.');
      return;
    }
    for (const e of l.entries) console.log(`${e.date}  ${e.kind.padEnd(10)} ${e.page}\n            ${e.summary}`);
    console.log(`\n${l.entries.length} entries.`);
    return;
  }
  throw new Error(`Unknown command ${cmd}. Use record or list.`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
