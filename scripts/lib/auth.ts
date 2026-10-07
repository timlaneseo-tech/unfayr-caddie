import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { google, type Auth } from 'googleapis';
import { configDir } from './paths.ts';

// googleapis bundles its own copy of google-auth-library; use the type it re-exports
// so the client it builds and the client its APIs accept are the same declaration.
export type OAuth2Client = Auth.OAuth2Client;

export const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
];

export function clientPath(): string {
  return join(configDir(), 'client.json');
}

export function tokenPath(): string {
  return join(configDir(), 'token.json');
}

interface ClientJson {
  installed?: { client_id: string; client_secret: string };
  web?: { client_id: string; client_secret: string };
}

export function readClient(): { clientId: string; clientSecret: string } {
  const p = clientPath();
  if (!existsSync(p)) {
    throw new Error(
      `No OAuth client file at ${p}.\n` +
        `Create a Desktop OAuth client in Google Cloud, download its JSON, and save it there. SETUP.md walks through it.`,
    );
  }
  const json = JSON.parse(readFileSync(p, 'utf8')) as ClientJson;
  const c = json.installed ?? json.web;
  if (!c?.client_id || !c?.client_secret) {
    throw new Error(`${p} does not look like a Google OAuth client file (expected an "installed" or "web" key).`);
  }
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

export function makeOAuthClient(redirectUri?: string): OAuth2Client {
  const { clientId, clientSecret } = readClient();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function saveToken(tokens: object): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(tokenPath(), JSON.stringify(tokens, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Authenticated client for the Search Console and GA4 APIs. Refreshes silently; the
 * refreshed token is written back so the next run does not need to refresh again.
 */
export function getAuth(): OAuth2Client {
  const p = tokenPath();
  if (!existsSync(p)) {
    throw new Error(`No token at ${p}. Run \`node scripts/setup.ts\` once to sign in. SETUP.md has the steps.`);
  }
  const client = makeOAuthClient();
  client.setCredentials(JSON.parse(readFileSync(p, 'utf8')));
  client.on('tokens', (t) => {
    const merged = { ...client.credentials, ...t };
    saveToken(merged);
  });
  return client;
}
