---
name: intent-match
description: Use when reading a /find run (candidates.json, a page extract, ai-check.json) to decide why a page sits at position 4 to 15 for its queries, which queries deserve effort, and whether the fix is an edit or a new page.
---

# Judging intent match

## Overview

A page in striking distance already satisfies Google enough to rank. It sits at 4 to 15 instead of 1 to 3 because the page answers the question less directly, less visibly, or less specifically than the pages above it. The diagnosis names the gap in concrete terms the owner can see on their own page. Everything the other two skills write follows from that one judgement.

## What you are reading

- `config.json`, the `notes` array: facts the owner recorded because the pages cannot show them. A page can rank for a location the business sold or a service it stopped offering; the data will say "build this out" and the note says "retire it". The note wins. When a page's queries are about something a note rules out, the fix is a `redirect` change (retire the page, 301 it to the best remaining page) and the removal of that subject from titles elsewhere, not an edit.
- `candidates.json`: ranked pages, each with its queries sorted by score. `prior` holds the previous 28 days. `brand: true` marks queries the site already owns. `newPage` lists queries the script thinks belong on a page that does not exist yet.
- `pages/<slug>.json`: the fetched page. `title`, `metaDescription`, `h1`, `headings` (the outline in order), `paragraphs` (in reading order, navigation and footer removed), `faq`, `jsonLd`, `wordCount`, `status` (`ok`, `thin`, `failed`).
- `ai-check.json`: for the top queries, what Gemini answered. Its `mode` is `grounded` (citations recorded: `cited`, `onSite`, `competitors`) or `plain` (free tier; no citations, only `answer` and `mentionsSite`). Empty with a `skippedReason` when `GEMINI_API_KEY` was not set.

## Which queries get effort

Score already ranks them. Work from the top of each page's list and stop when the remaining queries are variations of ones you have handled. A page usually has one or two real intents hiding under ten phrasings. "water heater leaking from bottom", "why is my water heater leaking from the bottom" and "water heater leaking from bottom repair cost" are one intent with a cost sub-question.

Brand queries get a row in the table and nothing else. The site already wins them; no edit changes that, and an owner who sees you spend a paragraph on their own name stops trusting the rest.

Questions matter more than their score suggests. `isQuestion: true` queries are what people ask assistants and what FAQ blocks exist for. Three or more question queries on one page is the trigger for an FAQ block.

The prior period tells you whether you are catching a page on the way up or down. A query that moved from 11 to 7 is responding to something; say so, and protect what is working. A query that slid from 5 to 9 has usually been outranked by a page that answers more directly, which strengthens the case for an answer-first paragraph.

## The four diagnoses

Read the page extract against the top queries and look for these, in this order. Name the one you find, with the specific evidence. Two sentences is the budget: the first says what the page does, the second says what the queries wanted.

**The answer is buried.** The page answers the query, but in paragraph six under a heading about something else. Count paragraphs in `paragraphs` to say where. Example: "The page answers 'leaking from the bottom' in paragraph 8, under the heading 'Other Causes'; the 1,900 people a month searching that phrase see a title about what to do and an H1 about why, and nothing in the outline that says 'bottom'."

**The title promises something else.** `title` and `h1` set an expectation the queries do not share. A title about "what to do" when every query asks "why"; an H1 about installation when the queries ask about cost; a brand-first title with the topic after the pipe. The fix is a title and H1 change, and it is usually the highest-value edit on the page because it changes the snippet everyone sees.

**No heading matches the question.** The queries are questions and the outline is topics. Searchers scanning the page, and systems extracting from it, look for a heading that restates their question. "How long do water heaters last" ranks at 4.6 with an H2 called "The Numbers". The fix is an H2 in the question's words with the answer directly under it.

**The AI answer cites a competitor's version of what this page says.** In `ai-check.json`, `onSite` is false and `competitors` is populated for a query this page could answer. Read the `answer`: it is usually a definition, a number, a range, or a short procedure. If this page contains the same fact but not as a quotable 40 to 80 word passage, that is the gap. Say which competitor was cited and what the quotable passage would be. If this page does not contain the fact at all, the fix is to add it, and the AI answer tells you exactly what a good answer looks like.

When `mode` is `plain` there are no citations, so this diagnosis changes shape: compare the `answer` with the page. If Gemini states a fact, number or step the page lacks, that is the gap to fill; if the page has it but buried, that is the heading-and-answer fix. `mentionsSite` false on a question about the site's own products or locations is worth one sentence ("Gemini does not name RTL when asked who sells Tadano cranes in Iowa"), and the diagnosis should say the check ran without citations so the owner knows why no competitor is named.

When none of these fit, the page is probably competing on authority rather than relevance, and an on-page edit will move it less. Say that honestly, propose the one structural improvement that still applies, and keep the verification line modest.

## Edit or new page

The script flags `newPage` when the query shares no word with the title, H1 or headings and the body barely mentions it. Treat the flag as a strong hint, not a verdict. Override it in two cases:

- The page is plainly about the topic and the words are simply missing from its headings. A pricing page flagged for "scheduling software cost" is a title and H1 problem on the pricing page, not a new page. Write it as an edit and say why you overrode the flag.
- The page is a hub (home page, service page) and the query is a sub-service it genuinely offers. "burst pipe what to do" on an emergency plumber page is a section the page should have, not a separate page.

Keep the flag when the ranking page would have to change subject to answer the query. A drain cleaning page ranking for "does Drano damage pipes" has nothing to say about Drano; a short post answering that question will outrank a sentence bolted onto a service page, and the service page stays focused. New-page briefs are their own section of the page file; they never replace the edits for the queries the page is actually about.

## Thin and failed pages

`status: "thin"` means little text came back, often a JavaScript-rendered page. `status: "failed"` means the fetch did not succeed. In both cases diagnose from the queries alone: what intents they cluster into, which are questions, and what the AI check says. Write the fixes as additions ("add an H2 ... with this paragraph") rather than rewrites of text you could not read, and say in the diagnosis that the page could not be read.

## Common mistakes

- Diagnosing with adjectives. "The content is thin and not optimised" tells the owner nothing. "The only mention of cost is in a table in the last third of the page, with no heading" tells them where to go.
- Treating every phrasing as a separate problem. Cluster first, then diagnose the cluster.
- Spending effort on brand queries or on queries at position 3.9 that the script left in for context.
- Ignoring the prior period. A page that is already climbing needs a lighter touch than one that is sliding.
- Writing a new-page brief for something the page should simply have a section about.
