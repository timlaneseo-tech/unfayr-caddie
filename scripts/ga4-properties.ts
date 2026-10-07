#!/usr/bin/env node
/**
 * List the GA4 properties this account can see, with each web stream's measurement ID,
 * so the numeric property ID that /monday needs can be matched to the G-XXXX tag you know.
 *
 *   node scripts/ga4-properties.ts                  list everything
 *   node scripts/ga4-properties.ts --find G-XXXXXXX  print the property ID for one measurement ID
 *   node scripts/ga4-properties.ts --find G-XXXXXXX --site example.com   also write it into config.json
 */
import { google } from 'googleapis';
import { parseArgs, flagString } from './lib/args.ts';
import { getAuth } from './lib/auth.ts';
import { loadConfig, saveConfig } from './lib/config.ts';
import { siteDir } from './lib/paths.ts';

interface PropertyRow {
  propertyId: string;
  displayName: string;
  account: string;
  measurementIds: string[];
}

async function listProperties(): Promise<PropertyRow[]> {
  const admin = google.analyticsadmin({ version: 'v1beta', auth: getAuth() });
  const out: PropertyRow[] = [];
  let pageToken: string | undefined;
  do {
    const res = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const acc of res.data.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) {
        const propertyId = (p.property ?? '').replace('properties/', '');
        const streams = await admin.properties.dataStreams.list({ parent: `properties/${propertyId}` }).catch(() => null);
        const measurementIds = (streams?.data.dataStreams ?? []).map((s) => s.webStreamData?.measurementId).filter((m): m is string => !!m);
        out.push({ propertyId, displayName: p.displayName ?? '', account: acc.displayName ?? '', measurementIds });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = await listProperties();
  const find = flagString(args, 'find');
  if (!find) {
    if (!rows.length) {
      console.log('No GA4 properties visible to this account.');
      return;
    }
    console.log('\nProperty ID   Measurement IDs        Property (account)');
    for (const r of rows) console.log(`${r.propertyId.padEnd(13)} ${(r.measurementIds.join(', ') || '-').padEnd(22)} ${r.displayName} (${r.account})`);
    console.log('\nUse the numeric Property ID as ga4PropertyId in sites/<domain>/config.json, or run with --find G-XXXX --site <domain>.');
    return;
  }
  const hit = rows.find((r) => r.measurementIds.includes(find));
  if (!hit) {
    console.error(`No property with measurement ID ${find} is visible to this account. Properties seen: ${rows.map((r) => `${r.displayName} (${r.propertyId})`).join(', ') || 'none'}.`);
    process.exit(1);
  }
  console.log(`${find} belongs to property ${hit.propertyId}: ${hit.displayName} (${hit.account})`);
  const domain = flagString(args, 'site');
  if (domain) {
    const dir = siteDir(process.cwd(), domain);
    const cfg = loadConfig(dir);
    cfg.ga4PropertyId = hit.propertyId;
    saveConfig(dir, cfg);
    console.log(`Wrote ga4PropertyId ${hit.propertyId} to ${dir}/config.json`);
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/analyticsadmin|Admin API|has not been used|is disabled/i.test(msg)) {
    console.error(`The Google Analytics Admin API is not enabled on your Cloud project, so the lookup cannot run.\nEither enable it (APIs & Services, Library, "Google Analytics Admin API") and run again, or copy the Property ID from GA4: Admin, Property settings, Property details. Then put it in config.json as ga4PropertyId.\n\nGoogle said: ${msg.slice(0, 300)}`);
  } else {
    console.error(msg);
  }
  process.exit(1);
});
