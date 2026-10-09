import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from './paths.ts';

/**
 * The Gemini key lives in Caddie's config folder so a guided setup can save it without
 * asking the user to edit environment variables and open a new terminal. An explicit
 * GEMINI_API_KEY still wins, for people who already set one up that way.
 */
export function geminiKeyPath(): string {
  return join(configDir(), 'gemini.json');
}

export function geminiKey(env: NodeJS.ProcessEnv = process.env): { key: string | null; source: 'env' | 'file' | null } {
  const fromEnv = env.GEMINI_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env' };
  const p = geminiKeyPath();
  if (existsSync(p)) {
    try {
      const key = (JSON.parse(readFileSync(p, 'utf8')) as { key?: string }).key?.trim();
      if (key) return { key, source: 'file' };
    } catch {
      // A damaged file reads as no key; setup writes a fresh one.
    }
  }
  return { key: null, source: null };
}

export function saveGeminiKey(key: string): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(geminiKeyPath(), JSON.stringify({ key: key.trim() }, null, 2) + '\n', { mode: 0o600 });
}

/** Choices the guided run should not ask about twice. */
export interface Prefs {
  geminiOffered?: boolean;
}

function prefsPath(): string {
  return join(configDir(), 'prefs.json');
}

export function prefs(): Prefs {
  const p = prefsPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Prefs;
  } catch {
    return {};
  }
}

export function savePrefs(update: Partial<Prefs>): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(prefsPath(), JSON.stringify({ ...prefs(), ...update }, null, 2) + '\n');
}
