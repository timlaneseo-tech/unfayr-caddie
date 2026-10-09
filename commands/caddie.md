---
description: Run a site through the whole Caddie process. Sets up whatever is missing (Google Cloud and Search Console, once), learns the business, runs /find, /gaps and /monday, and opens one short report. Use /caddie example.com, or /caddie --sample summitplumbing.example to see it without any setup.
argument-hint: <your site, e.g. example.com> | --sample summitplumbing.example
allowed-tools: Bash(node *), Bash(npm *), Bash(mkdir *), Bash(cd *), Read, Write, Edit, Glob
---

# /caddie

The person said something like "Run my site example.com through the entire Caddie process". Your job: get them set up if they are not, run everything, and finish with the report open in front of them. Make it feel effortless. They are a business owner or marketer, not a developer.

`$PLUGIN` below means `${CLAUDE_PLUGIN_ROOT}`. `$HOME_DIR` is the results folder doctor reports as `home`. Run every script from `$HOME_DIR` (`cd "$HOME_DIR" && node "$PLUGIN/scripts/..."`), because results land in `sites/` under the current folder.

## How to talk to them

- Short, warm, plain. One step at a time. Never paste more than one console step into a message.
- When you open a page for them, say what to click in one or two sentences, then wait for "done" (or a question, or an error they paste).
- Never show them JSON, stack traces or file paths they do not need. Translate errors into the one thing to do (see the playbook at the end).
- Never ask them to edit a file, set an environment variable or open a terminal. You do those.
- Between the long steps, one progress line each: "Reading your Search Console data and your pages..." so they know it has not stalled.

## 0. Sample mode

If `$ARGUMENTS` contains `--sample`, skip all setup: run `/find`, `/gaps` and `/monday` with those arguments following their command files (`$PLUGIN/commands/find.md`, `gaps.md`, `monday.md`) from the plugin folder, then step 7 with `--site summitplumbing.example --date <today>` and `--cwd` set to where the sample run wrote `sites/`. Tell them this is a fictional plumber so they can see what they will get.

## 1. Check where they are

```
node --version
node "$PLUGIN/scripts/doctor.ts" --site "<their site>"
```

If `node --version` is below 22.18 or missing, go to step 2. If doctor fails because packages are missing (a "Cannot find package" error), run `npm install --prefix "$PLUGIN"` and run doctor again. Create the results folder doctor names: `mkdir -p "$HOME_DIR"`.

Read `next` and go to that step. After each step, run doctor again and follow the new `next`, until it says `ready`. A returning user is usually `ready` straight away; then say "Welcome back. Running everything for <site> now." and go to step 6.

If `next` is `client` or `signin` and they have never been set up (no client file at all), start with exactly this, then go step by step:

> Great, before we get started let's get you set up with Google Cloud and Search Console. It takes about 15 minutes and you only have to do it once. Then the real magic begins.

## 2. `node`: Node is too old or missing

Tell them Caddie needs a free program called Node.js, version 22.18 or newer. Give them the link https://nodejs.org to click, ask them to install the version marked LTS, then close and reopen Claude Code and say the same sentence again.

## 3. `deps`

`npm install --prefix "$PLUGIN"`, quietly. No need to explain.

## 4. `client`: the Google Cloud project and OAuth client

Open each page with `node "$PLUGIN/scripts/setup.ts" --open-url <url>`. They must be signed in to Google with the account that can see their site in Search Console; say so at the first step.

1. **Project.** Open https://console.cloud.google.com/projectcreate. "Name it Caddie and click Create. When it finishes, make sure Caddie is the project selected at the top of the page."
2. **Search Console API.** Open https://console.cloud.google.com/apis/library/searchconsole.googleapis.com. "Click Enable."
3. **Analytics APIs** (so GA4 connects itself later). Open https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com, "Click Enable", then https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com, "Click Enable." Both in one message is fine.
4. **Consent screen.** Open https://console.cloud.google.com/auth/overview. "Click Get started. App name: Caddie. Support email: yours. Audience: External. Contact email: yours. Tick the agreement and click Create."
5. **Publish it.** Open https://console.cloud.google.com/auth/audience. "Under Publishing status, click Publish app, then Confirm." Say why in one line: otherwise Google signs them out every seven days.
6. **The client.** Open https://console.cloud.google.com/auth/clients/create. "Application type: Desktop app. Name: Caddie. Click Create, then click Download JSON in the box that appears." It must be Desktop app.
7. **Install it for them.** `node "$PLUGIN/scripts/setup.ts" --install-client` finds the newest `client_secret*.json` in Downloads and installs it. If it says Web application, send them back to step 6 for a Desktop app client. If it finds nothing, ask where the file went and pass its path.

## 5. `signin`, `site`, `profile`, `gemini`

**`signin`.** Tell them first: "A Google sign-in page is about to open. Pick the account that can see your site. Google will say it hasn't verified this app; that's expected because the app is your own. Click Advanced, then Go to Caddie, then Continue." Then run `node "$PLUGIN/scripts/setup.ts"` with a five-minute timeout; it waits for them. If doctor reports a sign-in `error` on a returning user (expired or revoked), say "Google needs you to sign in again" and do the same.

**`site`.** Doctor's `site.siteUrl` is null: say which Google account they signed in with and the properties it can see (from `site.reason`), and ask whether the site is under another account (sign in again) or not in Search Console yet (they add and verify it at https://search.google.com/search-console, then come back; data takes a few days to appear). If `siteUrl` is set but there is no config: `cd "$HOME_DIR" && node "$PLUGIN/scripts/sites.ts" --url "<their site>"`.

**`profile`: the business card.** Say "Now let me get to know the business." Run `cd "$HOME_DIR" && node "$PLUGIN/scripts/profile.ts" --site <domain>` and read `sites/<domain>/profile.json` (names, addresses, brands, titles, headings, the site's own prose, top queries). Draft and show this card, filled from those facts, nothing invented:

> **Here's what I understand about <business>.**
> - **Names people search for you by:** ...
> - **Locations:** ...
> - **What you sell or do:** ...
> - **Brands you carry** (if any): ...
> - **Who you compete with online:** ... (well-known sites in the space; say these are guesses)
> - **What your customers ask about:** five or six topics
> - **Your customers:** one line
>
> **One question:** is anything on your site out of date? A location you closed or sold, a service you stopped, a brand you no longer carry. Those pages can still rank, and I would rather tell you to retire them than to build them up.

Then write their answers into `sites/<domain>/config.json` with Edit: `brandTerms` (names, short forms), `notes` (one sentence per out-of-date fact, plus locations, service area and brands, phrased as facts), and `market` (`topics`, `competitors` as domains, `audience`, `maxQuestions: 40`, `maxBriefs: 8`). Then connect GA4 quietly: `cd "$HOME_DIR" && node "$PLUGIN/scripts/setup.ts" --ga4-from-site <domain>`; mention it only if it connected ("GA4 is connected too, so the memo will count leads.").

**`gemini`: offer it once.**

> One optional extra: I can also check what Google's Gemini AI says when people ask the questions your pages should answer, and whether it mentions you. It's free and takes two minutes. Want it?

If yes: open https://aistudio.google.com/apikey, "Click Create API key, choose Create a new project, then copy the key and paste it here." Save it with `node "$PLUGIN/scripts/setup.ts" --gemini-key <key>`. Then one line: "Want to also see which competitors Gemini cites instead of you? That needs a $5 prepay on that key's Google project, and most runs then cost a few cents." If yes, walk them through AI Studio, the key's row, Activate billing, then set `"mode": "grounded"` under `ai` in config.json. If no to the key: `node "$PLUGIN/scripts/setup.ts" --gemini-skip` and move on; never ask again.

## 6. The runs

Say: "You're all set. Running the full Caddie process on <site> now. This takes a few minutes." Then, from `$HOME_DIR`, follow each command file exactly, in this order, with `--site <domain>`:

1. `$PLUGIN/commands/find.md`, except its last step: build the pack without `--open` (`report.ts --run <find run> --pdf`). Progress line first: "Reading your Search Console data and your pages..."
2. `$PLUGIN/commands/gaps.md`. "Checking the questions your customers ask..."
3. `$PLUGIN/commands/monday.md`. "Writing this week's memo..."

Write every page file and brief in full, as those files require. If one command fails, say what was skipped in one line and carry on with the next; the report leaves out what is missing.

## 7. The report

```
cd "$HOME_DIR" && node "$PLUGIN/scripts/report.ts" --report --site <domain> --pdf --open
```

Then finish with five lines, no more:

1. "Your Caddie Report is open." (or its path, if it could not open)
2. The three moves at the top of it, one line each.
3. How many site-wide problems and new-page briefs it found.
4. Where everything is: the run folder, and the Implementation Pack "for whoever makes the edits".
5. "Run me again next week with the same sentence and I'll tell you what moved."

## Error playbook

| They see | Say |
|---|---|
| "Access blocked: Caddie has not completed the Google verification process" | The app is still in Testing and they are not a test user. Open https://console.cloud.google.com/auth/audience and click Publish app, then sign in again. |
| `redirect_uri_mismatch` | The client is a Web application. Make a new one at step 4.6 as a Desktop app. |
| "Google hasn't verified this app" | Expected. Advanced, then Go to Caddie, then Continue. |
| `invalid_grant`, "expired or revoked" | Sign in again (`signin`). |
| "has not been used in project ... or it is disabled" | Open the API's library page from step 4.2 or 4.3 and click Enable, then wait a minute. |
| Doctor shows no properties | They signed in with an account that is not a user on the Search Console property. Add that account in Search Console (Settings, Users and permissions) or sign in with the right one. |
| HTTP 402 or "prepayment credits are depleted" from Gemini | The key's project has a billing account with no credit. At https://console.cloud.google.com/billing/projects, find the project, three-dot menu, Disable billing. The key keeps working on the free tier. |

Built by Unfayr · unfayr.com
