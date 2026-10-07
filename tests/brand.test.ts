import { describe, expect, it } from 'vitest';
import { brandTokens, isBrandQuery } from '../scripts/lib/brand.ts';

describe('brandTokens', () => {
  it('takes the registrable label, its parts, and configured terms', () => {
    expect(brandTokens('summitplumbing.example', ['Summit Plumbing'])).toEqual(['summitplumbing', 'summit plumbing']);
    expect(brandTokens('www.summit-plumbing.co.uk', [])).toEqual(['summit-plumbing', 'summit', 'plumbing']);
  });

  it('drops short and generic tokens', () => {
    expect(brandTokens('ab.example', ['x'])).toEqual([]);
    expect(brandTokens('the-shop.example', [])).toEqual(['the-shop', 'shop'].filter((t) => t !== 'shop'));
  });
});

describe('isBrandQuery', () => {
  const tokens = brandTokens('summitplumbing.example', ['Summit Plumbing']);
  const cold = { position: 7, ctr: 0.02 };

  it('matches a brand term as a phrase or run together', () => {
    expect(isBrandQuery('summit plumbing reviews', tokens, cold, 0.4)).toBe(true);
    expect(isBrandQuery('summitplumbing hours', tokens, cold, 0.4)).toBe(true);
    expect(isBrandQuery('summitplumbingreviews', tokens, cold, 0.4)).toBe(true);
  });

  it('does not match a fragment of the brand', () => {
    expect(isBrandQuery('summit county water heater', tokens, cold, 0.4)).toBe(false);
    expect(isBrandQuery('plumbing near me', tokens, cold, 0.4)).toBe(false);
  });

  it('fires the position/CTR heuristic only when both hold', () => {
    expect(isBrandQuery('water heater repair', tokens, { position: 1.2, ctr: 0.55 }, 0.4)).toBe(true);
    expect(isBrandQuery('water heater repair', tokens, { position: 1.2, ctr: 0.2 }, 0.4)).toBe(false);
    expect(isBrandQuery('water heater repair', tokens, { position: 3.1, ctr: 0.6 }, 0.4)).toBe(false);
  });
});
