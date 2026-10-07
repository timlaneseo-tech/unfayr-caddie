---
name: gap-brief
description: Use when writing the briefs for a /gaps run from gaps.json, ai-check.json and the page extracts, so each open question becomes a draft answer page or an edit the owner can start from.
---

# Writing a gap brief

## Overview

A gap is a question people in this market ask that the site does not answer and an AI assistant answers without the site. The brief is not a content idea; it is the start of the page: a working title, a URL, an outline of headings phrased as questions, the first answer paragraph written in full, and the evidence that made it worth writing. The owner should be able to hand it to whoever writes for them and get a page back, or paste the first paragraph and keep going themselves.

**REQUIRED BACKGROUND:** answer-first-copy for the paragraph and headings; page-diff when the gap turns out to be an edit to an existing page rather than a new one.

## What you are reading

- `gaps.json`: `gaps` ranked by score with, for each, the question, where it came from (`search-console` with impressions and the page that ranks, `template` from a market topic, or `user`), `sitePage` (a page already about it, usually null for a gap), the AI flags (`aiAnswered`, `aiMentionsSite`, `aiCitesSite`, `aiCompetitors`) and `signals` saying why it is open. `covered` lists the questions the site already handles.
- `ai-check.json`: the answer text for each question. `mode` is `grounded` (citations) or `plain` (free tier; no citations, only whether the site is mentioned).
- `pages/*.json` and the latest `/find` run's extracts: what the site already says, so the brief uses the site's own facts and does not propose a page that exists.
- `README.md` in the run folder: the ranked table, with a `_pending_` cell for each brief to fill in.

## Which gaps get a brief

The README names how many (default eight, `market.maxBriefs`). Work down the ranked list, but skip a gap and take the next when:

- the question is not something this business can honestly answer (a template question about a topic they do not sell);
- a `covered` page or a page in the extracts already answers it under a different heading, in which case write an **edit**, not a brief: a new H2 and answer paragraph in page-diff form, and say which page;
- two gaps are the same page in waiting (cost and "is it worth it" for one service often are). Write one brief that answers both and say so in each row.

Template questions carry no impressions. They earn a brief when the AI answer names a competitor or when the site clearly should own the topic; otherwise they go below the Search Console questions.

## The brief

One file per gap, `<slug>.md` in the run folder, slug from the question. Sections in this order:

```markdown
# <Working title, 50 to 60 characters, question-shaped or answer-shaped>

Question: <the question as asked>
Where it came from: <"1,200 impressions a month in Search Console, ranking at 11 on /drain-cleaning, which is not about it" or "market topic: tankless water heater installation" or "your list">
URL: /<slug>

## Why it is a gap

<Two or three sentences. What the site has (or does not) for this question, and what the AI answer did: whom it named or cited, what it got right, what it left out or hedged. Quote the AI answer where that makes the point. In plain mode, say the check ran without citations.>

## What the page answers

- <The question>
- <Two to five follow-up questions a reader of this page asks next, taken from the variants in gaps.json, the AI answer's own structure, or the market>

## Outline

- H2 <the question, as a heading>
- H2 <...>
- H2 <...>
- H2 Common questions (only if three or more follow-ups are questions)

## First paragraph

<40 to 80 words, answer-first, in the site's voice, using only facts the site's pages or config already contain. Where a number is needed and the site has none, write [add yours: e.g. your typical range].>

## Verify

Publish, then watch "<query>" in Search Console (today: <position or "not ranking">) and ask an assistant the question again in a month. New pages typically take four to eight weeks to settle.

Built by Unfayr · unfayr.com
```

## Rules the brief depends on

**Facts are the site's.** The AI answer shows what a good answer covers; it does not supply this business's numbers, credentials or claims. Competitor figures stay out. `[add yours]` placeholders are honest; made-up specifics are not.

**The first paragraph is the page's purpose in one breath.** It gets lifted whole by search engines and assistants, so it answers in the first sentence and names the business in the last. See answer-first-copy.

**Edits are written as edits.** When the right fix is a section on an existing page, the file still gets written (so the ledger has it), but its body is a page-diff change: the page, the heading it follows, and the Before and After blocks. Its `changes.json` entry uses kind `h2` and that page's URL.

**The README one-liner names the deliverable.** "New page: Does Drano Damage Pipes?, first paragraph written" or "Edit: add a cost H2 to /tankless-water-heaters".

## changes.json

After the briefs, write `changes.json` in the run folder: one entry per brief. New pages use kind `new-page`, `page` set to the URL that ranks today for the question (from `gaps.json`, `rankingPage`) or the home page when nothing ranks, `summary` starting "New page: <working title>", and no `lookFor`. Edits use the kind and `lookFor` page-diff specifies. Then run the ledger script; `/monday` will ask whether the page was created.

## Common mistakes

- A brief that is a list of ideas rather than a title, outline and written first paragraph.
- Proposing a page the site already has under a different name. Check the extracts and `covered` first.
- Treating a template question with no impressions as if it had demand.
- Borrowing the AI answer's numbers.
- Forgetting the Verify section or the credit line.
