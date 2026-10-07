import { describe, expect, it } from 'vitest';
import { addDays, configDir, runDir, siteDir, todayIso } from '../scripts/lib/paths.ts';
import { parseArgs } from '../scripts/lib/args.ts';

const fwd = (p: string) => p.replace(/\\/g, '/');

describe('paths', () => {
  it('config dir ends with the app name and honours the override', () => {
    expect(fwd(configDir({}, 'linux'))).toMatch(/\/\.config\/strike$/);
    expect(fwd(configDir({ APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'win32'))).toBe('C:/Users/x/AppData/Roaming/strike');
    expect(fwd(configDir({ XDG_CONFIG_HOME: '/xdg' }, 'linux'))).toBe('/xdg/strike');
    expect(configDir({ STRIKE_CONFIG_DIR: '/custom' }, 'win32')).toBe('/custom');
  });

  it('composes site and run directories', () => {
    expect(fwd(siteDir('/w', 'example.com'))).toBe('/w/sites/example.com');
    expect(fwd(runDir('/w/sites/example.com', '2026-10-07', 'find'))).toBe('/w/sites/example.com/runs/2026-10-07/find');
  });

  it('handles dates in UTC', () => {
    expect(todayIso(new Date('2026-10-07T23:59:00Z'))).toBe('2026-10-07');
    expect(addDays('2026-10-07', -3)).toBe('2026-10-04');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('args', () => {
  it('parses flags, equals form, booleans and positionals', () => {
    const a = parseArgs(['--site', 'example.com', '--sample', '--date=2026-10-07', 'extra', '--no-ai']);
    expect(a.flags).toEqual({ site: 'example.com', sample: true, date: '2026-10-07', 'no-ai': true });
    expect(a.positional).toEqual(['extra']);
  });
});
