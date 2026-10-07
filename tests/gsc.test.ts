import { describe, expect, it } from 'vitest';
import { aggregate, fetchAllRows, windows } from '../scripts/lib/gsc.ts';
import type { GscRow } from '../scripts/lib/types.ts';

const row = (over: Partial<GscRow>): GscRow => ({
  query: 'q',
  page: 'https://x/a',
  date: '2026-10-01',
  clicks: 0,
  impressions: 0,
  ctr: 0,
  position: 0,
  ...over,
});

describe('windows', () => {
  it('ends three days ago and gives two back-to-back 28-day windows', () => {
    const w = windows(new Date('2026-10-07T12:00:00Z'));
    expect(w.current).toEqual({ start: '2026-09-07', end: '2026-10-04' });
    expect(w.prior).toEqual({ start: '2026-08-10', end: '2026-09-06' });
  });
});

describe('fetchAllRows', () => {
  it('pages with startRow until a short page arrives', async () => {
    const calls: number[] = [];
    const page = (n: number) => Array.from({ length: n }, (_, i) => row({ impressions: i }));
    const rows = await fetchAllRows(async (startRow) => {
      calls.push(startRow);
      return calls.length === 3 ? page(12) : page(25000);
    });
    expect(calls).toEqual([0, 25000, 50000]);
    expect(rows).toHaveLength(50012);
  });

  it('stops after one empty page', async () => {
    let calls = 0;
    const rows = await fetchAllRows(async () => {
      calls++;
      return [];
    });
    expect(calls).toBe(1);
    expect(rows).toEqual([]);
  });

  it('honours a custom row limit', async () => {
    const calls: number[] = [];
    await fetchAllRows(async (s) => {
      calls.push(s);
      return calls.length < 3 ? [row({}), row({})] : [row({})];
    }, 2);
    expect(calls).toEqual([0, 2, 4]);
  });
});

describe('aggregate', () => {
  it('sums clicks and impressions and weights position by impressions', () => {
    const agg = aggregate([
      row({ impressions: 100, clicks: 3, position: 4, date: '2026-10-01' }),
      row({ impressions: 300, clicks: 5, position: 8, date: '2026-10-02' }),
      row({ query: 'other', impressions: 10, position: 2 }),
    ]);
    expect(agg.size).toBe(2);
    const a = agg.get('q\u0000https://x/a')!;
    expect(a.impressions).toBe(400);
    expect(a.clicks).toBe(8);
    expect(a.position).toBe(7);
  });

  it('merges pages through the normaliser', () => {
    const agg = aggregate(
      [row({ page: 'https://x/a?utm=1', impressions: 1 }), row({ page: 'https://x/a/', impressions: 1 }), row({ page: 'https://x/a#top', impressions: 1 })],
      (p) => p.replace(/[?#].*$/, '').replace(/\/+$/, ''),
    );
    expect(agg.size).toBe(1);
    expect(agg.get('q\u0000https://x/a')!.impressions).toBe(3);
  });
});
