import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { clientPath } from './auth.ts';
import { configDir } from './paths.ts';

/**
 * Google names the downloaded OAuth client file client_secret_<id>.apps.googleusercontent.com.json.
 * The guided setup finds it in Downloads and puts it where Caddie reads it, so the owner
 * never has to find %APPDATA% or rename a file.
 */
export const DOWNLOAD_DIRS = [join(homedir(), 'Downloads'), join(homedir(), 'OneDrive', 'Downloads')];

export function findClientFile(dirs: string[] = DOWNLOAD_DIRS): string | null {
  let best: { file: string; mtime: number } | null = null;
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const name of readdirSync(d)) {
      if (!/^client_secret.*\.json$/i.test(name)) continue;
      const file = join(d, name);
      const mtime = statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime };
    }
  }
  return best?.file ?? null;
}

/** installed = Desktop app (what Caddie needs), web = Web application, invalid = not an OAuth client, null = no file. */
export function clientType(file: string): 'installed' | 'web' | 'invalid' | null {
  if (!existsSync(file)) return null;
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { client_id?: string } | undefined>;
    if (j.installed?.client_id) return 'installed';
    if (j.web?.client_id) return 'web';
  } catch {
    // fall through
  }
  return 'invalid';
}

export function installClient(file: string): { ok: true } | { ok: false; reason: string } {
  const type = clientType(file);
  if (type === 'web') {
    return { ok: false, reason: 'This is a Web application client. Create a Desktop app client instead (APIs & Services, Credentials, Create credentials, OAuth client ID, Desktop app).' };
  }
  if (type !== 'installed') return { ok: false, reason: `${file} is not a Google OAuth client file. Download the JSON from the client's row in APIs & Services, Credentials.` };
  mkdirSync(configDir(), { recursive: true });
  copyFileSync(file, clientPath());
  return { ok: true };
}
