# /monday: design

Status: designed, not built. `/find` already writes the ledger this command will read.

## What it answers

"What happened last week, what came of the things Caddie told me to do, and what are the three things to do this week?"

It is a memo, not a dashboard. One file, readable in three minutes, that remembers.

## Inputs

- `sites/<domain>/ledger.json`: every change `/find` (and later `/gaps`) proposed, with the page URL, the queries it served, the summary line, the page's content hash at the time, and the position and impressions at the time.
- Search Console, pulled as `/find` does but for the last 7 days and the 7 before, plus the 28-day windows already cached, with dimensions query, page and date.
- GA4 Data API, optional, when `ga4PropertyId` is in `config.json`: sessions, engaged sessions and conversions by landing page for the same two weeks, read-only scope already requested by `setup.ts`.
- The current content of every page the ledger mentions, fetched once, hashed with the same `extract()` so the hash is comparable.

## Pipeline

1. `scripts/monday-pull.ts`: Search Console for the two 7-day windows (cached under `data/` like the 28-day pulls), GA4 landing-page report for the same windows when configured.
2. `scripts/monday-status.ts`: for each ledger entry, fetch the page, compare `contentHash` with the stored one, and look for the proposed text. Status becomes one of:
   - `applied`: the page changed and the proposed heading or title text (from the summary line) is present.
   - `changed`: the page changed but the proposed text is not found; the owner edited something else or edited differently.
   - `unchanged`: hash matches; the edit was not made.
   - `gone`: the page no longer fetches.
   For each entry, pull the positions of exactly its queries, this week versus the week the change was proposed, so the memo can say "you changed the title on the 9th; the three queries it served moved from 7.4, 8.1 and 9.3 to 5.2, 6.0 and 8.8".
3. `scripts/monday-memo.ts` writes `runs/<date>/monday/memo.json` with the numbers and `README.md` with the deterministic tables. Claude writes the prose.

## What Claude writes

`memo.md`, in this order and nothing else:

1. **The week in one paragraph.** Clicks, impressions, average position for the site, this week against last, with the one number that moved most named and explained if the data explains it.
2. **What came of Caddie's suggestions.** A table of ledger entries with status and the position move on their queries, then two or three sentences: which applied edits moved, which did not yet (and that two to four weeks is normal), and which proposals are still sitting there with the impressions they are costing.
3. **Pages that moved on their own.** Up and down, with the queries, for anything not in the ledger. Flags a slide early.
4. **GA4, if present.** Landing pages whose sessions or conversions moved, tied to the Search Console pages above where the URLs match.
5. **Three things to do this week.** Each one a single sentence with a link to the `/find` file that has the paste-ready text, or a one-line instruction when it is a new `/find` run or a `/gaps` run. Never more than three.
6. The credit line.

The memo also updates the ledger: statuses written back, with the date observed, so the next memo can say "applied on or before the 14th".

## Open questions

- How to detect "applied" when the owner paraphrased the suggestion. Token overlap with the summary line at some threshold is probably enough; false negatives are reported as `changed` rather than `unchanged`, which is honest.
- Whether to send anything anywhere. No: the memo is a file. If the owner wants it in email or Slack they can pipe it; Caddie does not hold credentials for either.
- Scheduling. Claude Code can run `/monday` on a schedule where that is available; the command itself stays a one-shot that is safe to run any day.

Built by Unfayr · unfayr.com
