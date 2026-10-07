import { describe, expect, it } from 'vitest';
import { contentTokens, isQuestion, overlapCount, toUserQuestion } from '../scripts/lib/questions.ts';
import { normalisePage, slugFor, slugWords } from '../scripts/lib/urls.ts';

describe('isQuestion', () => {
  it('recognises question words and trailing marks', () => {
    expect(isQuestion('how long do water heaters last')).toBe(true);
    expect(isQuestion('is a leaking water heater an emergency')).toBe(true);
    expect(isQuestion('water heater repair cost?')).toBe(true);
    expect(isQuestion('water heater repair cost')).toBe(false);
    expect(isQuestion('doesnt matter')).toBe(false);
  });
});

describe('toUserQuestion', () => {
  it('applies the phrasing rules', () => {
    expect(toUserQuestion('how long do water heaters last')).toBe('How long do water heaters last?');
    expect(toUserQuestion('how to unclog a drain')).toBe('How do I unclog a drain?');
    expect(toUserQuestion('tankless water heater installation cost')).toBe('How much does tankless water heater installation cost?');
    expect(toUserQuestion('best salon booking app')).toBe('What is the best salon booking app?');
    expect(toUserQuestion('drain cleaning near me')).toBe('Who offers drain cleaning near me?');
    expect(toUserQuestion('calendly vs acuity')).toBe('Should I choose calendly or acuity?');
    expect(toUserQuestion('no show fee')).toBe('Can you tell me about no show fee?');
  });
});

describe('contentTokens and overlap', () => {
  it('drops stopwords and matches loose plurals', () => {
    expect(contentTokens('How long do water heaters last?')).toEqual(['long', 'water', 'heaters', 'last']);
    expect(overlapCount(contentTokens('water heater leaking from bottom'), contentTokens('Why Is My Water Heater Leaking?'))).toBe(3);
    expect(overlapCount(contentTokens('sewer line replacement cost'), contentTokens('Drain Cleaning | Summit Plumbing Drain Cleaning Services'))).toBe(0);
  });
});

describe('urls', () => {
  it('normalises page variants to one URL', () => {
    expect(normalisePage('https://x.example/a?utm=1')).toBe('https://x.example/a');
    expect(normalisePage('https://x.example/a/')).toBe('https://x.example/a');
    expect(normalisePage('https://x.example/a#top')).toBe('https://x.example/a');
    expect(normalisePage('https://x.example/')).toBe('https://x.example/');
  });

  it('builds slugs', () => {
    expect(slugFor('https://x.example/blog/a-b/')).toBe('blog-a-b');
    expect(slugFor('https://x.example/')).toBe('index');
    expect(slugFor('https://x.example/Pricing.html')).toBe('pricing');
    expect(slugWords('https://x.example/water-heater-repair')).toEqual(['water', 'heater', 'repair']);
  });
});
