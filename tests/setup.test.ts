import { describe, expect, it } from 'vitest';
import { browserCommand } from '../scripts/setup.ts';

const url = 'https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent&response_type=code&client_id=x';

describe('browserCommand', () => {
  it('never routes the URL through cmd.exe on Windows, so & survives', () => {
    const [cmd, args] = browserCommand('win32', url);
    expect(cmd).not.toMatch(/cmd/i);
    expect(args[args.length - 1]).toBe(url);
  });

  it('uses open and xdg-open elsewhere with the URL intact', () => {
    expect(browserCommand('darwin', url)).toEqual(['open', [url]]);
    expect(browserCommand('linux', url)).toEqual(['xdg-open', [url]]);
  });
});
