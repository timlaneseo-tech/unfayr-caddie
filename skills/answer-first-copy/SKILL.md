---
name: answer-first-copy
description: Use when writing the heading, answer paragraph, FAQ answer, title or meta description that a /find page file proposes, so a search engine or an assistant can lift the answer whole.
---

# Writing answer-first copy

## Overview

Search engines and assistants extract passages, not pages. A passage gets lifted when it answers the question in its first sentence, stands on its own without the paragraphs around it, and contains one specific fact the reader could act on. That is the whole technique. Everything below is how to hit it reliably using only what the page already knows.

## The answer paragraph

Forty to eighty words. One paragraph. Sits directly under a heading phrased as the question.

Shape:

1. **First sentence answers the question outright**, in the words the searcher used. Not "There are several factors." Not "Great question." The answer. "A conventional tank water heater lasts eight to twelve years."
2. **Second sentence gives the condition, the range, or the exception** that makes the first sentence trustworthy. "Tankless units last around twenty years but need annual descaling in hard water to get there."
3. **Third sentence, if there is room, says what to do or how to tell.** "The manufacture date is in the first four digits of the serial number on the label."

Why this order: the first sentence is what gets quoted; the second is what stops the quote from being wrong; the third is what makes a reader stay.

Example, written from a plumbing page whose body already contained these facts:

> **Why is my water heater leaking from the bottom?**
> A leak from the bottom of the tank that is not coming from the drain valve means the tank has corroded through, and a corroded tank cannot be repaired. Shut off the cold water supply and the gas or power, then call a plumber the same day, because a failed tank can release its full forty or fifty gallons without warning. If the water is only at the drain valve, that valve can be replaced on its own.

That is 73 words, answers in the first sentence, names the condition that changes the answer, and tells the reader what to do.

## Use only the page's own facts

Every number, price, timeframe, brand, credential and claim comes from `paragraphs`, `faq` or `jsonLd` in the page extract, or from `config.json`. If the page does not state a price, the answer paragraph does not state a price. Write the sentence with a placeholder in square brackets and say so in the fix: "[your typical range] — the page does not currently state one; add yours." An invented number on a business's own website is worse than no edit, and the owner will not trust anything else in the file after they spot it.

The AI check is a guide to what a good answer covers, not a source of facts for this site. If Gemini quoted a competitor saying repairs run $150 to $700, that tells you the searcher wants a range; it does not tell you this plumber's range.

## Headings as questions

The H2 restates the query as the searcher would ask it, capitalised normally, with a question mark when it is a question. "How long do water heaters last?" not "Lifespan". "How much does a plumber cost in Boise?" not "Pricing". When several phrasings cluster, pick the one with the most impressions and let the paragraph's first sentence carry the others' words naturally.

Keep an H2 under about seventy characters so it survives as a table-of-contents entry and a jump link.

## Titles

Fifty to sixty characters. Primary topic first, in the searcher's words, then the qualifier, then the brand after a separator if there is room. A title is the one line of copy every searcher reads, so it carries the single most-searched intent on the page, not a summary of everything on it.

- Before: "Water Heater Leaking? Here's What to Do | Summit Plumbing"
- After: "Why Is My Water Heater Leaking? Bottom, Top and Valve Leaks"

Keep the brand when the site is small and local; drop it when the title would otherwise truncate. Say which in the fix.

## Meta descriptions

One hundred forty to one hundred sixty characters. The answer's first sentence, shortened, plus the reason to click. Google rewrites descriptions often, so the point is not control of the snippet but giving it a good default and making the page's intent unmistakable to anything reading the head.

## FAQ answers

Each FAQ answer follows the same shape as the answer paragraph but shorter: twenty to fifty words, first sentence answers. Three to six questions, taken from the page's actual question queries, not invented. If only two queries are questions, there is no FAQ block; two answer paragraphs under their own H2s do the job better.

## Voice

Write the way the page already writes. Read three of its paragraphs first. A plumber's site says "call us the same day"; a SaaS blog says "set it up once in Settings". Match sentence length, use of "we", and formality. The owner should be able to paste the paragraph without a seam showing.

Plain words. No "leverage", "comprehensive", "robust", "seamless", "it's important to note", "in today's world". No rhetorical questions in the body. No sentence that could appear on any website about any topic.

## Common mistakes

- Opening with context instead of the answer. If the first sentence could be deleted without losing the answer, delete it.
- Hedging the first sentence into mush. "It depends on many factors" is not an answer. State the common case, then the exception.
- Inventing specifics. Placeholders in brackets are honest; made-up numbers are not.
- Writing a 150-word answer paragraph. Past eighty words it stops being a passage and becomes a section.
- Stuffing the query into every sentence. Once in the heading, once in the first sentence, then write normally.
- Changing the page's voice. A paragraph that sounds like a different author gets rewritten by the owner, and usually worse.
