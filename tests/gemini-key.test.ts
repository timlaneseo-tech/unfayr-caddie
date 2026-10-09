import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { geminiKey, prefs, saveGeminiKey, savePrefs } from '../scripts/lib/gemini-key.ts';

let dir = '';
const saved = process.env.CADDIE_CONFIG_DIR;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'caddie-key-'));
  process.env.CADDIE_CONFIG_DIR = dir;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (saved === undefined) delete process.env.CADDIE_CONFIG_DIR;
  else process.env.CADDIE_CONFIG_DIR = saved;
});

describe('gemini key store', () => {
  it('is empty when neither the environment nor the file has a key', () => {
    expect(geminiKey({})).toEqual({ key: null, source: null });
  });

  it('reads the saved key, and lets the environment variable win', () => {
    saveGeminiKey('  file-key  ');
    expect(geminiKey({})).toEqual({ key: 'file-key', source: 'file' });
    expect(geminiKey({ GEMINI_API_KEY: 'env-key' })).toEqual({ key: 'env-key', source: 'env' });
  });

  it('remembers that the key was offered', () => {
    expect(prefs().geminiOffered).toBeFalsy();
    savePrefs({ geminiOffered: true });
    expect(prefs().geminiOffered).toBe(true);
  });
});
