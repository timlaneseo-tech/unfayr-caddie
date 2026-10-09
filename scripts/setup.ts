#!/usr/bin/env node
/**
 * One-time sign-in. Runs the OAuth "desktop app" loopback flow: start a local
 * listener on 127.0.0.1, open the consent page, receive the code, exchange it,
 * and save the token in the config dir (never in a project folder).
 *
 *   node scripts/setup.ts          sign in
 *   node scripts/setup.ts --check  confirm the saved token can list properties
 *   node scripts/setup.ts --gemini-key <key>   save the Gemini key for the AI answer check
 *   node scripts/setup.ts --gemini-skip        do not offer the AI answer check again
 *   node scripts/setup.ts --ga4-from-site <domain>   find the site's GA4 property and save it
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { google } from 'googleapis';
import { parseArgs, flagBool, flagString } from './lib/args.ts';
import { geminiKeyPath, saveGeminiKey, savePrefs } from './lib/gemini-key.ts';
import { fetchHtml } from './fetch-page.ts';
import { adminApiHint, listProperties } from './ga4-properties.ts';
import { loadConfig, saveConfig } from './lib/config.ts';
import { measurementIds, resolveGa4 } from './lib/ga4-detect.ts';
import { siteDir } from './lib/paths.ts';
import { SCOPES, clientPath, getAuth, makeOAuthClient, saveToken, tokenPath } from './lib/auth.ts';

/**
 * The command that opens a URL. On Windows this must not go through cmd.exe:
 * `cmd /c start <url>` splits the URL at every `&`, which drops OAuth parameters
 * and produces "Required parameter is missing: response_type". rundll32 hands the
 * URL to the default browser without a shell in between.
 */
export function browserCommand(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  if (platform === 'darwin') return ['open', [url]];
  return ['xdg-open', [url]];
}

function openBrowser(url: string): void {
  const [cmd, args] = browserCommand(process.platform, url);
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // The URL is printed anyway; opening the browser is a convenience.
  }
}

async function check(): Promise<void> {
  const auth = getAuth();
  const sc = google.searchconsole({ version: 'v1', auth });
  const res = await sc.sites.list();
  const n = res.data.siteEntry?.length ?? 0;
  console.log(`Token OK. This account can see ${n} Search Console propert${n === 1 ? 'y' : 'ies'}.`);
  if (n > 0) console.log('Next: node scripts/sites.ts');
}

async function signIn(): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}/`;

  const client = makeOAuthClient(redirectUri);
  const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });

  console.log('Opening Google sign-in. If nothing opens, paste this URL into a browser:\n');
  console.log(url + '\n');
  openBrowser(url);

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out after 5 minutes waiting for the sign-in redirect.')), 5 * 60_000);
    server.on('request', (req, res) => {
      const u = new URL(req.url ?? '/', redirectUri);
      const err = u.searchParams.get('error');
      const c = u.searchParams.get('code');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      if (err || !c) {
        res.end(`Sign-in did not complete (${err ?? 'no code'}). You can close this tab and run setup again.`);
        clearTimeout(timer);
        reject(new Error(`Google returned: ${err ?? 'no code'}`));
        return;
      }
      res.end('Signed in. You can close this tab and go back to the terminal.');
      clearTimeout(timer);
      resolve(c);
    });
  });
  server.close();

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    console.warn('Warning: Google did not return a refresh token. Remove the app from https://myaccount.google.com/permissions and run setup again if the token stops working.');
  }
  saveToken(tokens);
  console.log(`Saved token to ${tokenPath()}`);
  await check();
}

/**
 * GA4 is optional, so nothing here fails the guided run: every outcome is one line, and
 * the exit code stays 0. Reads the home page for a G- ID and falls back to matching the
 * property's web stream URL, which covers sites that load GA4 through Tag Manager.
 */
async function ga4FromSite(domain: string): Promise<void> {
  const dir = siteDir(process.cwd(), domain);
  const cfg = loadConfig(dir);
  if (cfg.ga4PropertyId) {
    console.log(`GA4 already set: property ${cfg.ga4PropertyId}.`);
    return;
  }
  const home = cfg.siteUrl.startsWith('sc-domain:') ? `https://${cfg.siteUrl.slice('sc-domain:'.length)}/` : cfg.siteUrl;
  const page = await fetchHtml(home);
  const ids = measurementIds(page.html);
  let props;
  try {
    props = await listProperties();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`GA4 skipped. ${adminApiHint(msg) ?? msg.slice(0, 200)}`);
    return;
  }
  const id = resolveGa4(ids, new URL(home).hostname, props);
  if (!id) {
    console.log(ids.length ? `GA4 skipped: the site uses ${ids.join(', ')}, but this Google account cannot see that property.` : 'GA4 skipped: no GA4 property for this site is visible to this Google account.');
    return;
  }
  cfg.ga4PropertyId = id;
  saveConfig(dir, cfg);
  console.log(`GA4 connected: property ${id}.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const key = flagString(args, 'gemini-key');
  if (key) {
    saveGeminiKey(key);
    savePrefs({ geminiOffered: true });
    console.log(`Gemini key saved to ${geminiKeyPath()}. The AI answer check will run from now on.`);
    return;
  }
  const ga4Site = flagString(args, 'ga4-from-site');
  if (ga4Site) {
    await ga4FromSite(ga4Site);
    return;
  }
  if (flagBool(args, 'gemini-skip')) {
    savePrefs({ geminiOffered: true });
    console.log('Skipping the AI answer check. Caddie will not ask again; add a key any time with --gemini-key.');
    return;
  }
  console.log(`Using OAuth client: ${clientPath()}`);
  if (flagBool(args, 'check')) await check();
  else await signIn();
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
