# Kickoff brief (verbatim)

The brief this plugin was built from, kept so `PLAN.md` and `DECISIONS.md` can be read against it.

---

# Kickoff: build the Claude Code plugin

You are starting a new open-source Claude Code plugin in this empty repo. Read everything below, then write `PLAN.md`, ask me at most three questions that genuinely block you, and start building. Make routine decisions yourself and record them in `DECISIONS.md`.

## What this is

A free Claude Code plugin for marketers, agencies and one-person businesses. It turns Google Search Console into written, paste-ready fixes, finds the questions AI assistants answer badly in a market, and writes a weekly memo that remembers what it told you and reports what happened. Three slash commands, one shared data layer:

- `/find` : striking-distance queries from Search Console, with the fix written as a diff per page.
- `/gaps` : the questions in this market that Gemini and Claude answer weakly, uncited, or citing only competitors, with draft answer pages.
- `/monday` : weekly memo. Week-over-week Search Console and GA4, the status of every suggestion the other two commands made, the position moves on exactly those pages, and three things to do this week.

Build `/find` fully first. Scaffold `/gaps` and `/monday` as commands that explain they are coming and point at the design in `docs/`. Do not build them yet.

Working name for the plugin: pick a short lowercase slug and tell me; I may rename it.

## The three tests every output has to pass

A user should say "why didn't I think of that", "how is this free", and "I can't believe I did this by hand". Concretely: the output is never a list of problems. It is the edit, ready to paste, with the evidence next to it, and a line that says how and when to verify it worked.

## Hard constraints

- Zero running cost. Search Console API and GA4 Data API are free. Gemini API with Google Search grounding has a free daily quota, and it is the only paid-model API we use, inside that quota. All reading, judging and writing by Claude happens inside the user's Claude Code session on their own plan, never through the Anthropic API. Design around this: scripts fetch and shape data into JSON, the command markdown tells Claude what to read and what to write.
- No scraping of Google search results, Google Maps, ChatGPT or any AI product UI. Fetch only the user's own pages, pages the user names, and official APIs.
- No telemetry, no accounts, no hosted service. Everything runs locally and writes to the repo working directory.
- Node 22.18 or newer, ESM, TypeScript run through Node's native type stripping so there is no build step. Few dependencies: `googleapis` for Search Console and GA4, `@google/genai` for Gemini, `vitest` for tests. Nothing else unless you justify it in `DECISIONS.md`.
- MIT license. A one-line "built by bttrly, bttrly.com" credit at the foot of every generated document, nothing louder.

## Plugin layout

Use the Claude Code plugin format so the commands are slash commands after install: `.claude-plugin/plugin.json`, `commands/find.md`, `commands/gaps.md`, `commands/monday.md`, `skills/` for the shared knowledge Claude needs when writing (how to write answer-first copy, how to write a page diff, how to judge intent match), and `scripts/` for everything deterministic. Keep each command file short and point to skills and scripts. Keep `SKILL.md` files under 500 lines and explain the why behind each instruction rather than shouting rules.

Also make the plugin usable as a plain skills folder for people who do not install plugins. Document both paths.

## Setup and auth

- `scripts/setup.ts` runs an OAuth desktop loopback flow. The user creates one Google Cloud project, enables the Search Console API and the Analytics Data API, creates an OAuth desktop client, and drops the client JSON where `SETUP.md` says. Scopes: Search Console read-only, Analytics read-only. GA4 is optional and only `/monday` uses it.
- Tokens live outside the repo in the user's config directory. Never write credentials into the working directory, and add the obvious patterns to `.gitignore` anyway.
- Gemini key from `GEMINI_API_KEY`. If absent, `/find` still runs and skips the AI answer check, and says so in the output.
- `scripts/sites.ts` lists the Search Console properties the account can see and lets the user pick one. One site per workspace folder.

## Workspace layout

```
sites/<domain>/
  config.json        site URL, brand terms, locale, GA4 property id (optional), thresholds
  data/              raw API pulls, dated, JSON
  runs/<date>/find/  one markdown file per page plus README.md summary
  ledger.json        every suggestion ever made: date, page, query, what we proposed, content hash of the page at the time
```

`ledger.json` is the memory `/monday` will read later. Write to it from `/find` now, even though `/monday` does not exist yet.

## `/find` in detail

Data pull (`scripts/gsc-pull.ts`):
- Last 28 days, and the 28 days before that for comparison. Dimensions query and page. Also date, so the memo can later see trend. Handle the 25,000 row limit with pagination. Cache to `data/` so re-running the same day does not re-pull.
- Build a brand-term filter from `config.json` plus a heuristic: tokens from the domain name and any query where the site holds position 1 to 2 with very high CTR. Mark brand queries, do not drop them; the writer must not spend effort on them.

Candidate selection (`scripts/find-candidates.ts`):
- Default window position 4 to 15, configurable. Minimum impressions scales with the site: default 20 in 28 days or the 80th percentile of the site's query impressions, whichever is lower, so small sites still get results.
- Opportunity score per query: impressions multiplied by the CTR gap between the current position and position 3, using a simple published CTR-by-position curve you cite in the code. Sum by page. Rank pages. Cap at 25 pages per run, configurable.
- For each page, keep every qualifying query, sorted by score, with position, impressions, clicks, and the change versus the prior period.
- Detect "wrong page ranks": a query whose best-ranking URL is not the page the query is about, using the query text against page titles and H1s. Flag these as "new page" opportunities, not edits.
- Output `candidates.json`.

Page fetch (`scripts/fetch-page.ts`):
- Fetch each candidate page with a polite user agent and a timeout. Extract title, meta description, canonical, H1, the heading outline, main content text, existing FAQ and other JSON-LD, word count. Store a content hash. Save the extracted structure as JSON. If the fetch fails, record it and move on; the writer works from what it has.

AI answer check (`scripts/ai-check.ts`, needs `GEMINI_API_KEY`):
- For the top three queries per page, ask Gemini with Google Search grounding, phrased as a user would ask it. Record the answer text, every cited URL, whether any cited URL is on the site, and which competitors are cited. One call per query. Stay under the free daily quota and stop politely when near it, saying how many were skipped.

The writing step is in `commands/find.md` and the skills it loads. Claude reads `candidates.json`, the page extracts and the AI check, and writes one markdown file per page containing:
1. The queries table with position, impressions, and score.
2. A two-sentence diagnosis of why the page sits where it sits. Be specific: the query is answered in paragraph six, the title promises something else, no heading matches the question, the AI answer cites a competitor's definition and this page has none.
3. The fix as before and after blocks per change: new title and meta description, a new or rewritten H2 that matches the question, an answer-first paragraph of 40 to 80 words under it that a search engine or assistant can quote, an FAQ block when three or more queries are questions, and the matching FAQ JSON-LD. Use before and after blocks rather than unified diffs because the user's CMS is unknown; keep each change small enough to paste in a minute.
4. For "new page" flags: a brief with the working title, the questions it answers, the outline, and the first answer paragraph written.
5. A verification line: which queries to watch in Search Console, and that movement typically shows in two to four weeks.

Plus `README.md` for the run: the ranked list of pages with one line each, totals, what was skipped and why, and how to run again.

Record every proposed change in `ledger.json` with the page content hash, so `/monday` can later tell whether the page changed and what the position did afterwards.

## Sample mode

`--sample` runs the whole `/find` pipeline on fixture data in `fixtures/` with no credentials and no network. This is how people try it in two minutes and how you test. Build the fixtures from a realistic small service business site and a realistic SaaS blog, about 300 queries each.

## Quality bar

- Vitest tests for scoring, brand detection, pagination, the CTR curve, page extraction on saved HTML fixtures, and ledger writes. Tests run without network.
- `npm run check` runs typecheck, tests, and a sample-mode `/find` end to end.
- `README.md` is written for a marketer, not a developer: what it does, a 90-second demo using sample mode, the three-step real setup, what it costs (nothing), what it never does (scrape, phone home, write to your site). `SETUP.md` is the click-by-click Google Cloud walkthrough. `docs/gaps.md` and `docs/monday.md` hold the designs for the next two commands.
- Before you call `/find` done, run it in sample mode, read the output as if you were the site owner, and fix anything you would not paste into your own site.

## Order of work

1. `PLAN.md`, then the plugin skeleton and `setup.ts`, and prove auth works against my own Search Console property.
2. `gsc-pull.ts`, `find-candidates.ts`, tests, fixtures, sample mode.
3. `fetch-page.ts` and `ai-check.ts`.
4. `commands/find.md` and the writing skills. Iterate on the output quality in sample mode until it passes the three tests.
5. README, SETUP, docs for the other two commands, ledger.
6. Scaffold `/gaps` and `/monday` as explained stubs.

Commit in small steps with clear messages. Do not open a pull request; push to main in this repo.
