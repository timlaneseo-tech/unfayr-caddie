import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diagnose, type DoctorDeps } from '../scripts/lib/doctor.ts';
import { caddieHome, homeFor } from '../scripts/lib/paths.ts';

let cfg = '';
let home = '';
let plugin = '';
const saved = { ...process.env };
beforeEach(() => {
  cfg = mkdtempSync(join(tmpdir(), 'caddie-doc-cfg-'));
  home = mkdtempSync(join(tmpdir(), 'caddie-doc-home-'));
  plugin = mkdtempSync(join(tmpdir(), 'caddie-doc-plugin-'));
  mkdirSync(join(plugin, 'node_modules'));
  process.env.CADDIE_CONFIG_DIR = cfg;
  delete process.env.GEMINI_API_KEY;
});
afterEach(() => {
  for (const d of [cfg, home, plugin]) rmSync(d, { recursive: true, force: true });
  process.env = { ...saved };
});

const desktop = JSON.stringify({ installed: { client_id: 'a', client_secret: 's' } });
const deps = (over: Partial<DoctorDeps> = {}): DoctorDeps => ({
  nodeVersion: 'v24.1.0',
  pluginRoot: plugin,
  home,
  site: 'rtlequipment.com',
  listProperties: async () => ['https://www.rtlequipment.com/'],
  ...over,
});
const ready = () => {
  writeFileSync(join(cfg, 'client.json'), desktop);
  writeFileSync(join(cfg, 'token.json'), '{}');
};
const config = (extra: object) => {
  mkdirSync(join(home, 'sites', 'www.rtlequipment.com'), { recursive: true });
  writeFileSync(join(home, 'sites', 'www.rtlequipment.com', 'config.json'), JSON.stringify({ siteUrl: 'https://www.rtlequipment.com/', ...extra }));
};

describe('doctor', () => {
  it('stops at an old Node first', async () => {
    expect((await diagnose(deps({ nodeVersion: 'v22.3.0' }))).next).toBe('node');
  });

  it('asks for dependencies when node_modules is missing', async () => {
    rmSync(join(plugin, 'node_modules'), { recursive: true });
    expect((await diagnose(deps())).next).toBe('deps');
  });

  it('asks for the OAuth client when none is installed, or when it is the wrong type', async () => {
    expect((await diagnose(deps())).next).toBe('client');
    writeFileSync(join(cfg, 'client.json'), JSON.stringify({ web: { client_id: 'b' } }));
    const d = await diagnose(deps());
    expect(d.next).toBe('client');
    expect(d.client.type).toBe('web');
  });

  it('asks for sign-in when there is no token, or the token no longer works', async () => {
    writeFileSync(join(cfg, 'client.json'), desktop);
    expect((await diagnose(deps())).next).toBe('signin');
    writeFileSync(join(cfg, 'token.json'), '{}');
    const d = await diagnose(deps({ listProperties: async () => { throw new Error('invalid_grant: Token has been expired or revoked.'); } }));
    expect(d.next).toBe('signin');
    expect(d.signin.error).toMatch(/expired/);
  });

  it('stops at the site when no property matches, with the reason', async () => {
    ready();
    const d = await diagnose(deps({ site: 'nowhere.example' }));
    expect(d.next).toBe('site');
    expect(d.site?.reason).toMatch(/rtlequipment/);
  });

  it('asks for the site config, then the business card, then the Gemini offer', async () => {
    ready();
    expect((await diagnose(deps())).next).toBe('site');
    config({ brandTerms: [] });
    expect((await diagnose(deps())).next).toBe('profile');
    config({ brandTerms: ['RTL'], ga4PropertyId: '370532903' });
    const d = await diagnose(deps());
    expect(d.next).toBe('gemini');
    expect(d.site?.domain).toBe('www.rtlequipment.com');
    expect(d.site?.ga4PropertyId).toBe('370532903');
  });

  it('is ready once the Gemini key is saved or was declined', async () => {
    ready();
    config({ brandTerms: ['RTL'] });
    writeFileSync(join(cfg, 'prefs.json'), JSON.stringify({ geminiOffered: true }));
    const d = await diagnose(deps());
    expect(d.next).toBe('ready');
    expect(d.gemini.keySet).toBe(false);
  });

  it('reports ready without a site when only setup is being checked', async () => {
    ready();
    writeFileSync(join(cfg, 'prefs.json'), JSON.stringify({ geminiOffered: true }));
    const d = await diagnose(deps({ site: undefined }));
    expect(d.site).toBeNull();
    expect(d.next).toBe('ready');
  });
});

describe('results home', () => {
  it('uses CADDIE_HOME, else Documents/Caddie, and keeps a folder that already has sites/', () => {
    expect(caddieHome({ CADDIE_HOME: '/x/y' })).toBe('/x/y');
    expect(caddieHome({})).toBe(join(homedir(), 'Documents', 'Caddie'));
    mkdirSync(join(home, 'sites'));
    expect(homeFor(home, {})).toBe(home);
    expect(homeFor(plugin, {})).toBe(join(homedir(), 'Documents', 'Caddie'));
  });
});
