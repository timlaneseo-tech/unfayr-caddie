# /gaps: design

Status: designed, not built. `/find` ships first; this document is the plan `/gaps` will be built from.

## What it answers

"Which questions in my market do AI assistants answer badly, and what should I publish to become the answer?"

Badly means one of three things, recorded per question: the answer is weak (hedged, generic, wrong on a point the site knows), the answer cites nobody, or the answer cites only competitors. Each is an opening of a different size, and the memo should say which.

## Inputs

- `sites/<domain>/config.json`, with a new optional `market` block: `topics` (a handful of phrases that define the market), `competitors` (domains), `audience` (one line, so questions are phrased the way those people ask).
- The site's own Search Console queries from `data/`, reused: every question-form query the site already gets impressions for is a candidate, whatever its position.
- The user's own pages (fetched as `/find` does), to know what the site can already answer.
- Questions the user names on the command line or in a `questions.txt` next to the config, for things they know people ask that Search Console does not show.

No scraping of AI products. Gemini is queried through its API with Google Search grounding, inside the free quota. Claude's own answers come from the user's Claude Code session, where Claude is asked the same questions cold, without the site's pages in context, and then judges its own answer against them.

## Pipeline

1. `scripts/gaps-questions.ts` builds the question list: question-form queries from Search Console (deduped by intent using the same token matching as `/find`), expanded with a small set of templates per topic ("how much does X cost", "X vs Y", "is X worth it", "how to choose X"), plus the user's list. Capped at 40 per run by default so the Gemini quota is respected; the cap is in config.
2. `scripts/ai-check.ts` is reused as is: one grounded Gemini call per question, answer text and citations recorded, on-site and competitor hosts marked. Runs against the daily cap shared with `/find`.
3. The command asks Claude each question in the session, with no site context, and records the answer in `claude-answers.json`. This is the "Claude answers weakly" signal and costs nothing beyond the session.
4. `scripts/gaps-score.ts` scores each question: impressions from Search Console where known, plus a judgement vector written by Claude (weak / uncited / competitor-only for each of Gemini and Claude), plus whether the site already has a page that answers it (token overlap with titles, H1s and headings, as in `flagNewPages`). Questions the site already answers well drop out; questions with no page and a weak or competitor-only AI answer rise.
5. Output `gaps.json` and a run folder `runs/<date>/gaps/` with `README.md` and one brief per gap.

## What Claude writes

One file per gap, same discipline as `/find` page files:

1. The question, phrased as asked, with where it came from (Search Console impressions and current position if any; user-supplied; template).
2. What Gemini said and whom it cited; what Claude said. Two sentences on why the answer is weak, with the specific hedge or omission quoted.
3. The draft answer page: working title, URL, outline of H2s as questions, and the first 40 to 80 word answer paragraph written in full, using only facts the site's pages or config already contain, with `[add yours]` where a number is missing.
4. If the site already has a page that nearly answers it: an edit instead of a new page, in `/find` before/after form, with a note that this is the cheaper route.
5. Verify: the question to re-ask in a month, and the Search Console query to watch.

`changes.json` entries use kind `new-page` or the `/find` kinds for edits, so `/monday` tracks them the same way.

## Open questions

- Whether to run Gemini's grounded check and a second ungrounded check per question, to separate "the model does not know" from "the model found a competitor". Doubles quota use; probably an opt-in flag.
- How to phrase questions for Claude so the answer reflects what a user would see in Claude.ai rather than a Claude Code session with the repository in context. Likely a fenced "answer as if asked cold" instruction and no file reads before answering.
- Whether `market.competitors` should be inferred from the AI check's citations after the first run. Probably yes, with the user confirming.

Built by Unfayr · unfayr.com
