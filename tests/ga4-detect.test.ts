import { describe, expect, it } from 'vitest';
import { measurementIds, resolveGa4 } from '../scripts/lib/ga4-detect.ts';

const props = [
  { propertyId: '111', measurementIds: ['G-OTHER0001'], streamUris: ['https://other.example'] },
  { propertyId: '370532903', measurementIds: ['G-CZZ52WE39Q'], streamUris: ['https://www.rtlequipment.com'] },
];

describe('GA4 detection', () => {
  it('reads each measurement ID once from gtag and config snippets', () => {
    const html = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-CZZ52WE39Q"></script>
      <script>gtag('config', 'G-CZZ52WE39Q'); gtag('config','G-SECOND99');</script>`;
    expect(measurementIds(html)).toEqual(['G-CZZ52WE39Q', 'G-SECOND99']);
  });

  it('resolves by measurement ID first', () => {
    expect(resolveGa4(['G-CZZ52WE39Q'], 'anything.example', props)).toBe('370532903');
  });

  it('falls back to the stream website when the page only loads GTM', () => {
    expect(resolveGa4([], 'rtlequipment.com', props)).toBe('370532903');
    expect(resolveGa4([], 'www.rtlequipment.com', props)).toBe('370532903');
  });

  it('returns null when nothing matches', () => {
    expect(resolveGa4(['G-NOPE12345'], 'nowhere.example', props)).toBeNull();
  });
});
