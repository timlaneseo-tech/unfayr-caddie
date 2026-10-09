import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clientType, findClientFile, installClient } from '../scripts/lib/client-install.ts';

let dir = '';
let cfg = '';
const saved = process.env.CADDIE_CONFIG_DIR;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'caddie-dl-'));
  cfg = mkdtempSync(join(tmpdir(), 'caddie-cfg-'));
  process.env.CADDIE_CONFIG_DIR = cfg;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(cfg, { recursive: true, force: true });
  if (saved === undefined) delete process.env.CADDIE_CONFIG_DIR;
  else process.env.CADDIE_CONFIG_DIR = saved;
});

const desktop = JSON.stringify({ installed: { client_id: 'a.apps.googleusercontent.com', client_secret: 's', redirect_uris: ['http://localhost'] } });
const web = JSON.stringify({ web: { client_id: 'b.apps.googleusercontent.com', client_secret: 's' } });

function put(name: string, body: string, ageSeconds: number): string {
  const f = join(dir, name);
  writeFileSync(f, body);
  const t = Date.now() / 1000 - ageSeconds;
  utimesSync(f, t, t);
  return f;
}

describe('OAuth client install', () => {
  it('finds the newest downloaded client file and ignores other JSON', () => {
    put('client_secret_old.apps.googleusercontent.com.json', desktop, 600);
    const newest = put('client_secret_new.apps.googleusercontent.com.json', desktop, 10);
    put('package.json', '{}', 1);
    expect(findClientFile([dir, join(dir, 'missing')])).toBe(newest);
    expect(findClientFile([join(dir, 'missing')])).toBeNull();
  });

  it('installs a Desktop app client into the config folder', () => {
    const f = put('client_secret_x.json', desktop, 1);
    expect(installClient(f)).toEqual({ ok: true });
    expect(readFileSync(join(cfg, 'client.json'), 'utf8')).toBe(desktop);
    expect(clientType(join(cfg, 'client.json'))).toBe('installed');
  });

  it('refuses a Web application client and says which kind to create', () => {
    const r = installClient(put('client_secret_w.json', web, 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Desktop app/);
    expect(existsSync(join(cfg, 'client.json'))).toBe(false);
  });

  it('refuses a file that is not an OAuth client', () => {
    const r = installClient(put('client_secret_bad.json', '{"hello":1}', 1));
    expect(r.ok).toBe(false);
    expect(clientType(join(dir, 'client_secret_bad.json'))).toBe('invalid');
    expect(clientType(join(dir, 'nope.json'))).toBeNull();
  });
});
