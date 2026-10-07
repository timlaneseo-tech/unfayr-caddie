import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig, domainFromSiteUrl, loadConfig, saveConfig, siteHost } from '../scripts/lib/config.ts';

const tmp: string[] = [];
afterEach(() => {
  for (const t of tmp.splice(0)) rmSync(t, { recursive: true, force: true });
});

describe('domainFromSiteUrl', () => {
  it('handles domain and URL-prefix properties', () => {
    expect(domainFromSiteUrl('sc-domain:Example.com')).toBe('example.com');
    expect(domainFromSiteUrl('https://www.example.com/')).toBe('www.example.com');
    expect(domainFromSiteUrl('https://example.com/blog/')).toBe('example.com-blog');
  });

  it('siteHost drops www and paths', () => {
    expect(siteHost('https://www.example.com/')).toBe('example.com');
    expect(siteHost('sc-domain:example.com')).toBe('example.com');
    expect(siteHost('https://example.com/blog/')).toBe('example.com');
  });
});

describe('defaultConfig', () => {
  it('uses the spec thresholds', () => {
    const c = defaultConfig('sc-domain:example.com');
    expect(c.thresholds).toEqual({ positionMin: 4, positionMax: 15, minImpressions: 20, maxPages: 25, brandCtr: 0.4, queriesPerPageForAi: 3 });
    expect(c.ai).toEqual({ model: 'gemini-2.5-flash', dailyCap: 1000 });
    expect(c.domain).toBe('example.com');
  });
});

describe('loadConfig', () => {
  it('round-trips and fills missing thresholds from defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'strike-'));
    tmp.push(dir);
    saveConfig(dir, defaultConfig('sc-domain:example.com'));
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ siteUrl: 'sc-domain:example.com', domain: 'example.com', brandTerms: ['Acme'], thresholds: { positionMax: 20 } }));
    const c = loadConfig(dir);
    expect(c.brandTerms).toEqual(['Acme']);
    expect(c.thresholds.positionMax).toBe(20);
    expect(c.thresholds.positionMin).toBe(4);
    expect(c.ai.model).toBe('gemini-2.5-flash');
  });

  it('names the fix when the file is missing', () => {
    expect(() => loadConfig(join(tmpdir(), 'does-not-exist-strike'))).toThrow(/sites\.ts/);
  });
});
