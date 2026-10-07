---
name: weekly-memo
description: Use when writing memo.md for a /monday run from memo.json and the run's README.md tables, so the owner gets a three-minute read that remembers what Caddie suggested and says what to do this week.
---

# Writing the Monday memo

## Overview

The memo is the part of Caddie that remembers. Every other report a marketer gets describes a week; this one also says what came of last week's advice. Its credibility rests on two things: every number comes from the run's `README.md` tables, and every sentence of judgement is one the owner can check against them. It is a memo, not a dashboard, and it is finished when someone can read it in three minutes and know what to do on Monday.

## What you are reading

- `memo.json`: `thisWeek` and `lastWeek` totals, `changes` (one per ledger entry, with `status`, `statusDetail`, `proposedOn`, `appliedOn` and each query's position at proposal, last week and this week), `moversUp` and `moversDown` (pages not in the ledger), `ga4` (or null), and `notes` the script wants mentioned.
- `README.md` in the same folder: the same data as tables. Link to it as "the tables" rather than repeating them.
- The `/find` page files the changes came from, under `runs/<proposedOn>/find/<slug>.md`, so "three things to do" can point at paste-ready text.

## The memo

`memo.md`, in this order and nothing else. Headings are fixed.

```markdown
# Week of <this week start> to <end>: <site host>

## The week in one paragraph
<Clicks, impressions and average position this week against last, with the one number that
moved most named first and, if the tables explain it, why. Four sentences at most.>

## What came of Caddie's suggestions
<One sentence of counts: n applied, n changed, n unchanged, n gone. Then two or three sentences:
which applied changes moved and by how much on their own queries; which have not moved yet and
that two to four weeks is normal; which proposals are still sitting there and what they are costing
in impressions. Name pages by their H1 or path, not by URL.>

## Pages that moved on their own
<Up, then down, two to four sentences. A slide of more than two positions on a page with real
impressions gets flagged as something to look at this week.>

## GA4
<Only when memo.json has ga4. Two or three sentences tying landing-page sessions or key events to
the Search Console pages above where the paths match. Omit the section entirely when ga4 is null.>

## Three things to do this week
1. <One sentence, imperative, with a link to the /find file that holds the paste-ready text, or the
   command to run.>
2. <...>
3. <...>

Built by Unfayr · unfayr.com
```

## Rules the memo depends on

**Numbers come from the tables.** Clicks, impressions, positions and percentages are copied from `README.md`. Do not compute new ones in prose beyond a difference the table already implies. If a number is not in the tables, it is not in the memo.

**Say what moved before why.** "Clicks fell 18% to 212 while impressions held" is the fact; "the drop is on the pricing page, which slid from 6 to 9" is the explanation the tables support. Causes the tables do not show are not offered. Seasonality, algorithm updates and competitor launches are guesses; a memo that guesses once is not trusted twice.

**Fresh suggestions read as unchanged, and that is fine.** A change proposed in the last seven days should be reported as "proposed on the 7th, not yet applied" rather than as a failure. Movement after an edit typically shows in two to four weeks, and the memo says so once, in the suggestions section, not in every sentence.

**Applied changes are judged on their own queries.** The suggestions table holds each query's position at proposal, last week and this week. An applied title change whose queries moved from 7.4 to 5.2 gets that fact in the memo; one whose queries have not moved yet gets "applied on the 14th, no movement yet, within the normal window".

**New-page suggestions are not detectable from the ranking page.** The status table says so. The memo asks the owner whether the page was created, rather than reporting it as not done.

**Three things, exactly.** Each is one sentence, starts with a verb, and links to where the text to paste already exists. The first is whatever the tables say is worth the most: usually the highest-impression unchanged suggestion, or a sliding page. If the ledger is empty, the three things are: run `/find`, add brand terms to config, and set a date to run `/monday` again. Never more than three, never fewer.

**Tone.** Plain and specific, the way a good colleague summarises a week. No exclamation marks, no "great news", no "unfortunately". The owner should be able to forward it without editing.

## Common mistakes

- Inventing a reason for a move that the tables cannot support.
- Reporting same-week proposals as failures.
- Listing every ledger entry in prose; the table does that, the prose picks out what matters.
- More than three things to do, or things with no link to the text that does them.
- Numbers in the memo that are not in the tables.
