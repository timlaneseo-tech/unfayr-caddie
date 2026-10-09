import { describe, expect, it } from 'vitest';
import { matchProperty } from '../scripts/lib/match.ts';

const tims = ['https://brechbilltrailers.com/', 'https://www.rtlequipment.com/', 'https://www.simplypolybags.com/', 'sc-domain:behaviormoxie.com'];

describe('matchProperty', () => {
  it('matches a bare domain, a www host or a full URL to the URL-prefix property', () => {
    for (const input of ['rtlequipment.com', 'www.rtlequipment.com', 'https://www.rtlequipment.com/about', 'RTLequipment.com/']) {
      expect(matchProperty(input, tims).siteUrl).toBe('https://www.rtlequipment.com/');
    }
  });

  it('matches a domain property, including for a subdomain of it', () => {
    expect(matchProperty('behaviormoxie.com', tims).siteUrl).toBe('sc-domain:behaviormoxie.com');
    expect(matchProperty('blog.behaviormoxie.com', tims).siteUrl).toBe('sc-domain:behaviormoxie.com');
  });

  it('prefers the domain property when both kinds exist', () => {
    expect(matchProperty('www.x.com', ['https://www.x.com/', 'sc-domain:x.com']).siteUrl).toBe('sc-domain:x.com');
  });

  it('does not match a different subdomain to a URL-prefix property', () => {
    expect(matchProperty('parts.rtlequipment.com', tims).siteUrl).toBeNull();
  });

  it('says what it saw when nothing matches', () => {
    const r = matchProperty('nowhere.example', tims);
    expect(r.siteUrl).toBeNull();
    expect(r.reason).toContain('https://www.rtlequipment.com/');
    expect(matchProperty('nowhere.example', []).reason).toMatch(/no Search Console properties/);
  });
});
