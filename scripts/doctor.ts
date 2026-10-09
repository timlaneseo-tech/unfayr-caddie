#!/usr/bin/env node
/**
 * Report, as JSON, what is set up and the next step of the guided run.
 *
 *   node scripts/doctor.ts                      setup only
 *   node scripts/doctor.ts --site example.com   setup plus the site's property and config
 *   node scripts/doctor.ts --cwd <dir>          where sites/ lives (default: this folder if it
 *                                               has sites/, else Documents/Caddie)
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { parseArgs, flagString } from './lib/args.ts';
import { getAuth } from './lib/auth.ts';
import { diagnose } from './lib/doctor.ts';
import { homeFor } from './lib/paths.ts';

async function listProperties(): Promise<string[]> {
  const res = await google.searchconsole({ version: 'v1', auth: getAuth() }).sites.list();
  return (res.data.siteEntry ?? []).filter((s) => s.siteUrl && s.permissionLevel !== 'siteUnverifiedUser').map((s) => s.siteUrl as string);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = flagString(args, 'cwd');
  const report = await diagnose({
    nodeVersion: process.version,
    pluginRoot: fileURLToPath(new URL('..', import.meta.url)),
    home: cwd ? resolve(cwd) : homeFor(process.cwd()),
    site: flagString(args, 'site'),
    listProperties,
  });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
