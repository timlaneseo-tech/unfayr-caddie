import { describe, expect, it } from 'vitest';
import { CTR_BY_POSITION, ctrAt, opportunity } from '../scripts/lib/ctr.ts';

describe('ctr curve', () => {
  it('matches the cited values at integer positions', () => {
    expect(ctrAt(1)).toBe(0.071);
    expect(ctrAt(3)).toBe(0.017);
    expect(ctrAt(10)).toBe(0.002);
  });

  it('is monotonically non-increasing from 1 to 20', () => {
    for (let p = 2; p <= 20; p++) expect(CTR_BY_POSITION[p]).toBeLessThanOrEqual(CTR_BY_POSITION[p - 1]);
  });

  it('interpolates between integer positions and clamps outside 1..20', () => {
    const mid = ctrAt(3.5);
    expect(mid).toBeLessThan(ctrAt(3));
    expect(mid).toBeGreaterThan(ctrAt(4));
    expect(ctrAt(40)).toBe(ctrAt(20));
    expect(ctrAt(0.2)).toBe(ctrAt(1));
    expect(ctrAt(Number.NaN)).toBe(ctrAt(20));
  });
});

describe('opportunity', () => {
  it('is impressions times the CTR gap to position 3', () => {
    expect(opportunity(1000, 8)).toBeCloseTo(1000 * (0.017 - 0.003), 9);
  });

  it('is zero at or above the target', () => {
    expect(opportunity(1000, 2)).toBe(0);
    expect(opportunity(1000, 3)).toBe(0);
  });

  it('ranks a high-impression position 12 query above a low-impression position 5 query', () => {
    expect(opportunity(5000, 12)).toBeGreaterThan(opportunity(100, 5));
  });
});
