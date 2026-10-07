#!/usr/bin/env node
/**
 * One-time sign-in. Runs the OAuth "desktop app" loopback flow: start a local
 * listener on 127.0.0.1, open the consent page, receive the code, exchange it,
 * and save the token in the config dir (never in a project folder).
 *
 *   node scripts/setup.ts          sign in
 *   node scripts/setup.ts --check  confirm the saved token can list properties
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { google } from 'googleapis';
import { parseArgs, flagBool } from './lib/args.ts';
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
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
