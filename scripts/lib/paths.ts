import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_NAME = 'caddie';

/**
 * Credentials and the Gemini usage counter live here, never in a project folder,
 * so a careless `git add .` can never pick up a token.
 */
export function configDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (env.CADDIE_CONFIG_DIR) return env.CADDIE_CONFIG_DIR;
  if (platform === 'win32' && env.APPDATA) return join(env.APPDATA, APP_NAME);
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, APP_NAME);
  return join(homedir(), '.config', APP_NAME);
}

export function siteDir(cwd: string, domain: string): string {
  return join(cwd, 'sites', domain);
}

export function runDir(site: string, date: string, command: string): string {
  return join(site, 'runs', date, command);
}

export function dataDir(site: string): string {
  return join(site, 'data');
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
