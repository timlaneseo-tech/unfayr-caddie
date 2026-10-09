# Guided run: "Run my site through the entire Caddie process"

Approved in conversation with Tim, 2026-10-09.

## Goal

A new user installs Caddie, opens Claude Code and says "Run my site example.com through the entire Caddie process". Caddie sets up whatever is missing, guiding the parts only the user can do, runs `/find`, `/gaps` and `/monday`, and opens one short report that makes them think "they gave me far more than the company I've been paying". A returning user saying the same sentence goes straight to the runs.

## Decisions

- **Bring your own Google Cloud project** (Tim's call). Caddie guides it step by step; no shared Unfayr OAuth client.
- **Welcome line** when setup is missing: "Great, before we get started let's get you set up with Google Cloud and Search Console. It takes about 15 minutes and you only have to do it once. Then the real magic begins."
- **Results live in `Documents/Caddie`** (`~/Documents/Caddie`; `CADDIE_HOME` overrides; a folder that already has `sites/` is used as is).
- **Publish the consent-screen app** during setup so sign-ins do not expire every 7 days.
- **Business card** (option A): Caddie drafts brand terms, locations, offerings, competitors and topics from the site and its queries, shows them, asks one question ("anything on the site that is out of date?"), and saves the answers to `config.json`.
- **GA4** found silently from the home page's `G-` tag and resolved to a property ID; skipped when absent.
- **Gemini key** offered once, pasted in chat, stored in the config dir (`gemini.json`); env var still wins. The citations upgrade ($5 prepay, then cents a run) is offered in one line and switches `ai.mode` to `grounded`.
- **One combined report**, about 8 to 10 pages, clickable contents and PDF bookmarks, opens at the end. The full per-page scorecard becomes the **Implementation Pack**, linked, not opened.

## Flow

1. Welcome (only if setup is missing).
2. Preflight: Node 22.18+, `npm install` in the plugin root, results folder.
3. Google setup, one step at a time, each opening the exact console URL and waiting for "done": project; enable Search Console API, Analytics Data API, Analytics Admin API; consent screen (External, app name, emails, test user, publish); Desktop OAuth client and JSON download, which Caddie finds in Downloads and installs; sign-in; `doctor.ts` confirms. Known errors map to one fix each.
4. Site match (`example.com`, `www.example.com`, full URL all resolve to the right property, domain or URL-prefix), business card, GA4.
5. Optional Gemini key, then optional citations.
6. `/find`, `/gaps`, `/monday` with one progress line between each. All three write their normal outputs plus a `summary.json`.
7. Combined report opens; five-line chat summary.

## Components

- `scripts/doctor.ts`: JSON setup state (node, deps, home, client file and type, token validity and visible properties, site config, GA4, Gemini key and mode). `--site <url>` resolves the site.
- `scripts/lib/match.ts`: URL or domain to Search Console property.
- `scripts/setup.ts`: `--install-client` (find newest `client_secret*.json` in Downloads or a given path, validate Desktop type, copy to config dir), `--gemini-key <key>`, `--ga4-from-site <domain>`.
- `scripts/lib/gemini-key.ts`: key lookup, env then `gemini.json`.
- `scripts/profile.ts --site <domain>`: fetches home and about pages, reads JSON-LD Organization/LocalBusiness, titles, top non-brand queries; writes `profile.json` facts for Claude to draft the card from. `scripts/sites.ts --pick` unchanged; `--url` added.
- `scripts/report.ts`: `--report <site> --date <date>` builds `Caddie Report - <host> - <date>.pdf` from the three runs' `summary.json`, memo and briefs; `--run` keeps building the Implementation Pack (renamed file) from a `/find` run. TOC links plus `--generate-pdf-document-outline` bookmarks.
- `scripts/lib/sitewide.ts`: site-wide patterns from `/find` extracts (shared meta description, titles over 60, soft-404 "not found" pages returning 200, missing H1, duplicate titles).
- `summary.json` per run, written by Claude following the command docs: `/find` pages `{ slug, page, h1, oneLine, effort, clicks, fixes:[{label,before,after}] }`, `/gaps` briefs `{ slug, title, url, question, why, firstParagraph, kind }`, `/monday` `{ weekLine, moves:[...] }` (the memo itself is read from `memo.md`).
- `commands/caddie.md` and `skills/caddie-run/SKILL.md`: the orchestration checklist, welcome text, setup steps and URLs, error playbook. The skill's description triggers on "run my site ... through caddie" and similar.
- `SETUP.md` rewritten to mirror the guided steps.

## Report contents

Cover "Your top 5 moves this week" (page, one-line fix, clicks a month, effort) with a numbers strip; contents; how the site is doing (from the memo data); top 5 fixes at about half a page each with before/after for the key edits and a pointer into the Implementation Pack; every other page as a checklist table; site-wide problems; new pages to create (gap cards); what Caddie checked (counts, skips, AI mode); next week. Target at most 10 pages for a 25-page run.

## Errors

Every step succeeds, repairs itself, or tells the user one thing to do. Skips are listed in the chat summary and on "What Caddie checked". Thin Search Console data produces a report that says so and leans on `/gaps`.

## Testing

Unit tests for doctor state, URL matching, client install, Gemini key lookup, GA4 tag extraction, site-wide patterns, report assembly (top 5 ordering, checklist, gap cards, TOC). `npm run check` runs the sample `/find`, `/gaps`, `/monday` scripts and builds the combined report and checks its page count. A fresh-clone run with an empty config dir before release.
