---
name: page-diff
description: Use when writing the per-page markdown file and changes.json for a /find run, so each proposed edit is a before/after block the owner can paste into any CMS in under a minute.
---

# Writing a page diff

## Overview

The owner's CMS is unknown. It might be WordPress, Webflow, Shopify, a Squarespace blog or hand-written HTML. Unified diffs assume a file; before/after blocks assume only that the owner can find the old text and replace it with the new. Each block is small enough to paste in a minute, so the whole file can be applied in a lunch break and each change can be judged on its own.

The file is never a list of problems. Every section ends in text the owner can paste, with the evidence beside it and a line about how to know it worked.

## The page file

One file per candidate page, named `<slug>.md` in the run folder, in this order. Headings are fixed so the files are scannable side by side.

```markdown
# <H1 of the page, or the URL if none>

<url>
Rank <n> of <total> in this run. <score> extra clicks a month if its queries reach position 3. Fetched <ok | thin: N words | failed: reason>.

## Queries

| Query | Position | 28 days ago | Impressions | Clicks | Score |
|-------|---------:|------------:|------------:|-------:|------:|
| water heater leaking from bottom | 7.4 | 10.1 | 1,900 | 29 | 26.6 |
| summit plumbing water heater | 1.1 | 1.2 | 180 | 95 | brand |

## Why it sits here

<Two sentences. See intent-match.>

## Fixes

### 1. Title

Before:
```
Water Heater Leaking? Here's What to Do | Summit Plumbing
```
After:
```
Why Is My Water Heater Leaking? Bottom, Top and Valve Leaks
```
Why: <one line: the queries ask why, the title says what to do; 58 characters.>

### 2. Meta description

Before / After / Why, same shape.

### 3. New section after "<existing heading>"

Add this heading and paragraph directly after the "<existing heading>" section (currently paragraph <n>):

```
## Why is my water heater leaking from the bottom?

<40 to 80 word answer paragraph>
```
Why: <one line.>

### 4. FAQ

Add before the final section:

```
## Common questions about a leaking water heater

**Is a leaking water heater an emergency?**
<20 to 50 words>

**Can a leaking water heater be repaired?**
<20 to 50 words>

**Should I turn off my water heater if it is leaking?**
<20 to 50 words>
```

And this JSON-LD in the page head (or your SEO plugin's schema field):

```json
{ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [ ... ] }
```
Why: <one line.>

## New page: <working title>

<Only when a newPage flag survives the intent-match judgement.>

Queries it would answer: <list with impressions>
Working title: <50 to 60 characters>
URL suggestion: </slug>
Outline:
- H2 ...
- H2 ...
First paragraph (answer-first, 40 to 80 words):
```
<paragraph>
```

## Verify

Watch these queries in Search Console: <top three or four, exact strings>. Today they sit at <positions>. Movement usually shows in two to four weeks; compare the 28 days after the edit with the 28 days before. If the title changed, also check that the clicks per impression on the page rose.

Built by Unfayr · unfayr.com
```

## Rules the shape depends on

**Before blocks quote the page exactly.** Copy `title`, `metaDescription` and heading text from the extract character for character. The owner finds the old text by searching for it; a paraphrase breaks that. When there is no existing text (no meta description, a new section), write `Before:` followed by `(none)` and skip to After.

**Every change has a Why line.** One line, naming the query or evidence it serves and the character count for titles and descriptions. The Why is what lets the owner skip a change they disagree with and still trust the rest.

**Placement is explicit.** New sections say which existing heading they follow and which paragraph number that is in the extract. "Add a section about cost" is a task; "add this after 'How We Price Work', currently paragraph 4" is an edit.

**One intent per change.** A new H2 with its paragraph is one change. Two intents are two numbered changes, even if they sit next to each other on the page. The owner should be able to apply change 3 and not change 4.

**Fix count.** Three to five numbered fixes for a typical page: title, meta, one or two sections, FAQ if earned. More than six means the diagnosis was not sharp enough; go back and cluster.

**The FAQ block is earned, not default.** It appears when three or more of the page's queries are questions (`isQuestion: true`) and they are not already answered by the new sections. The visible block is the point; it is what readers and assistants use. The FAQPage JSON-LD is included because it is cheap and describes the visible block to anything that reads structured data, but Google no longer shows FAQ rich results for most sites, so the Why line must not promise one. JSON-LD questions and answers must match the visible text exactly, and if the page already has FAQPage JSON-LD (`faq` or `jsonLd` in the extract), extend it rather than adding a second block.

**New-page briefs are additions, not replacements.** The page's own edits come first. A brief has the queries it answers, a working title, a URL, an outline of H2s phrased as questions, and the first paragraph written in full so the owner can start from something rather than nothing.

**The credit line is the last line**, exactly `Built by Unfayr · unfayr.com`, on every page file and on README.md.

## Count with the script, not by eye

Character and word counts written from memory are wrong about a third of the time, and a Why line that says "158 characters" above a 172-character description is the fastest way to lose the owner's trust. After writing the page files and `changes.json`, run:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-page.ts" --run <run folder>
```

It reports title and meta lengths, answer paragraph word counts, FAQ text that differs from its JSON-LD, missing sections, `_pending_` cells left in README.md, and `changes.json` entries that point at pages not in the run. Run it first with `--fix-counts`, which rewrites the "N characters" in the Title and Meta Why lines to the measured values, then fix every remaining error (a title or description that is actually too long needs rewriting, not relabelling) and run it again before recording the ledger. The ledger can be recorded again after edits; it replaces that run's earlier entries.

## changes.json

After the page files, write `changes.json` in the run folder: one entry per numbered fix and per new-page brief, across all pages.

```json
[
  { "page": "https://summitplumbing.example/blog/why-is-my-water-heater-leaking", "kind": "title", "queries": ["why is my water heater leaking", "water heater leaking from bottom"], "summary": "Title: \"Why Is My Water Heater Leaking? Bottom, Top and Valve Leaks\"", "lookFor": "Why Is My Water Heater Leaking? Bottom, Top and Valve Leaks" },
  { "page": "https://summitplumbing.example/blog/why-is-my-water-heater-leaking", "kind": "h2", "queries": ["water heater leaking from bottom"], "summary": "New H2 \"Why is my water heater leaking from the bottom?\" after \"Other Causes\"", "lookFor": "Why is my water heater leaking from the bottom?" },
  { "page": "https://summitplumbing.example/drain-cleaning", "kind": "new-page", "queries": ["does drano damage pipes"], "summary": "New post: Does Drano Damage Pipes?" }
]
```

Each entry also carries `lookFor`: the exact text whose presence on the live page will mean the change was made. For a title it is the new title; for an H2 the new heading; for an answer paragraph its first sentence; for a FAQ the first question; for a meta description the new description. `/monday` re-fetches the page and searches for this text, so it must be copied from the After block character for character, and it must be text that is not already on the page. New-page briefs have no `lookFor`.

`kind` is one of `title`, `meta`, `h2`, `answer`, `faq`, `faq-jsonld`, `schema`, `new-page`. An H2 with its answer paragraph is one `h2` entry; an H1 change is a `title` entry whose summary starts with "H1:"; `schema` is JSON-LD other than FAQ, such as a LocalBusiness block for a location page. `page` is the candidate page URL exactly as it appears in `candidates.json`, including for new-page briefs (the page that currently ranks). `queries` are exact query strings from the table. `summary` is the one line /monday will show when it reports what happened to this change, so it names the actual text.

The ledger script fills in the date, content hash and positions. Run it after writing: it is idempotent.

## README one-liners

`README.md` in the run folder has a `_pending_` cell per page. Replace each with the fix in one line, in the imperative, naming the change: "Retitle to the why question and add a bottom-leak section after 'Other Causes'". That table is what the owner reads first and forwards to whoever makes the edits.

## Common mistakes

- Paraphrasing the Before text. It has to be findable.
- A fix that says what to do without the text to paste.
- Titles over sixty characters or descriptions over one hundred sixty, with no count in the Why.
- An FAQ block on a page with one question query, or FAQ JSON-LD that does not match the visible questions.
- Promising a FAQ rich result.
- Forgetting the Verify section or the credit line.
- changes.json with a `kind` outside the list, or a `page` URL that differs from candidates.json by a trailing slash.
