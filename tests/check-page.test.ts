import { describe, expect, it } from 'vitest';
import { checkPageFile } from '../scripts/check-page.ts';

const good = `# Page

https://x.example/a
Rank 1 of 1.

## Queries

| Query | Position |
|---|---|
| q | 7.0 |

## Why it sits here

Two sentences.

## Fixes

### 1. Title

Before:
\`\`\`
Old Title
\`\`\`
After:
\`\`\`
Why Is My Water Heater Leaking? Bottom, Top and Valve Leaks
\`\`\`
Why: 59 characters.

### 2. Meta description

Before:
\`\`\`
(none)
\`\`\`
After:
\`\`\`
A leak from the bottom of a water heater usually means the tank has failed; top and valve leaks are usually repairable. How to tell and what to do first.
\`\`\`
Why: fits.

### 3. New section

\`\`\`
## Why is my water heater leaking from the bottom?

${'word '.repeat(60).trim()}
\`\`\`

### 4. FAQ

\`\`\`
## Common questions

**Is it an emergency?**
Yes if the tank itself leaks.

**Can it be repaired?**
Valves yes, tanks no.

**Should I turn it off?**
Yes, water and power.
\`\`\`

\`\`\`json
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
 {"@type":"Question","name":"Is it an emergency?","acceptedAnswer":{"@type":"Answer","text":"Yes if the tank itself leaks."}},
 {"@type":"Question","name":"Can it be repaired?","acceptedAnswer":{"@type":"Answer","text":"Valves yes, tanks no."}},
 {"@type":"Question","name":"Should I turn it off?","acceptedAnswer":{"@type":"Answer","text":"Yes, water and power."}}
]}
\`\`\`

## Verify

Watch these. Movement usually shows in two to four weeks.

Built by Unfayr · unfayr.com
`;

describe('checkPageFile', () => {
  it('passes a well-formed file', () => {
    expect(checkPageFile(good, 'a.md').filter((f) => f.level === 'error')).toEqual([]);
  });

  it('flags long titles and metas, long answers, FAQ mismatches and a missing credit', () => {
    const bad = good
      .replace('Why Is My Water Heater Leaking? Bottom, Top and Valve Leaks', 'A Very Long Title That Keeps Going Well Past Sixty Characters Total')
      .replace('How to tell and what to do first.', 'How to tell and what to do first, plus a great deal more text than fits.')
      .replace('word '.repeat(60).trim(), 'word '.repeat(90).trim())
      .replace('"text":"Valves yes, tanks no."', '"text":"Valves yes."')
      .replace('Built by Unfayr · unfayr.com', 'Built by someone else');
    const msgs = checkPageFile(bad, 'a.md').filter((f) => f.level === 'error').map((f) => f.message);
    expect(msgs.some((m) => /title is 6\d characters/.test(m))).toBe(true);
    expect(msgs.some((m) => /meta description is 1[7-9]\d characters/.test(m))).toBe(true);
    expect(msgs.some((m) => /answer paragraph is 90 words/.test(m))).toBe(true);
    expect(msgs.some((m) => /FAQ answer differs from JSON-LD for "Can it be repaired\?"/.test(m))).toBe(true);
    expect(msgs.some((m) => /last line must be/.test(m))).toBe(true);
  });

  it('checks a claimed character count against the measured one', () => {
    const msgs = checkPageFile(good.replace('Why: 59 characters.', 'Why: 57 characters.'), 'a.md').map((f) => f.message);
    expect(msgs).toContain('title Why line says 57 characters but it is 59');
    expect(checkPageFile(good, 'a.md').filter((f) => f.level === 'error')).toEqual([]);
  });

  it('reports missing sections', () => {
    const msgs = checkPageFile(good.replace('\n## Verify', '\n## Check'), 'a.md').map((f) => f.message);
    expect(msgs).toContain('missing section "## Verify"');
  });
});
