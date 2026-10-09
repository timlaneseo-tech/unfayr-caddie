# Guided Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Run my site example.com through the entire Caddie process" sets a new user up, runs `/find`, `/gaps`, `/monday`, and opens one short combined report.

**Architecture:** Deterministic helpers (doctor, matching, client install, Gemini key store, GA4 detection, profile facts, site-wide checks, report data) as small `scripts/lib/*.ts` units with CLIs in `scripts/`; an orchestration command plus skill tells Claude the order, the copy and the error playbook; `report.ts` gains a combined report built from the three runs' existing files.

**Tech Stack:** Node 22.18+ native TypeScript, googleapis, node-html-parser, marked, vitest, local Chrome/Edge for PDF.

**Spec:** `docs/superpowers/specs/2026-10-09-guided-run-design.md`

## Global Constraints

- No new runtime dependencies.
- Credentials and keys only in `configDir()`; never in a working folder.
- Results home: `CADDIE_HOME` if set, else `~/Documents/Caddie`.
- Welcome copy, verbatim: "Great, before we get started let's get you set up with Google Cloud and Search Console. It takes about 15 minutes and you only have to do it once. Then the real magic begins."
- Report file names: `Caddie Report - <host> - <date>.pdf` (run date folder), `Implementation Pack - <host> - <date>.pdf` (find folder). HTML siblings with the same base name.
- Combined report at most 10 PDF pages for the sample run.
- Credit line `Built by Unfayr · unfayr.com` on every output.

**Deviation from the spec, decided while planning:** the report reads the files the commands already write (README one-liners, `changes.json`, page markdown, briefs, `memo.md`, `memo.json`) instead of a new Claude-written `summary.json`. Fewer things for the writer to get wrong, and it works on runs that already exist, including today's RTL run.

## Review Focus

- A property list holding both `sc-domain:x.com` and `https://www.x.com/`: matching must pick the domain property, not fail as ambiguous. (Task 3 test.)
- A downloaded OAuth file of type "web": install must refuse and say "create a Desktop app client". (Task 4 test.)
- A site with GTM only and no literal `G-` id in the HTML: GA4 must still resolve by matching the stream's website URL. (Task 2 test.)
- A run with fewer than five `/find` pages, or no `/gaps` or `/monday` run: the combined report still renders, leaving out empty sections. (Task 7 test.)
- A token that exists but is expired or revoked: doctor must report `signin` as the next step, not crash. (Task 5 test.)

---

### Task 1: Gemini key store

**Files:** Create `scripts/lib/gemini-key.ts`; modify `scripts/setup.ts`, `scripts/find.ts`, `scripts/gaps.ts`, `scripts/ai-check.ts`; test `tests/setup.test.ts`.

**Interfaces:** Produces `geminiKey(env?): { key: string | null; source: 'env' | 'file' | null }`, `saveGeminiKey(key: string): void`, `prefs(): Prefs`, `savePrefs(p: Partial<Prefs>): void` where `Prefs = { geminiOffered?: boolean }`, file `configDir()/gemini.json` `{ key }` and `configDir()/prefs.json`.

- [ ] Test: env wins over file; file used when env missing; null when neither; `savePrefs({geminiOffered:true})` round-trips (use `CADDIE_CONFIG_DIR` temp dir).
- [ ] Implement; `setup.ts --gemini-key <key>` saves and marks offered, `--gemini-skip` marks offered; find/gaps/ai-check call `geminiKey().key` instead of `process.env.GEMINI_API_KEY`.
- [ ] `npm test` passes; commit `feat: store the Gemini key in Caddie's config folder`.

### Task 2: HTML fetch helper and GA4 detection

**Files:** Create `scripts/lib/ga4-detect.ts`; modify `scripts/fetch-page.ts` (extract `fetchHtml`), `scripts/ga4-properties.ts` (export `listProperties`, add `streamUris`), `scripts/setup.ts` (`--ga4-from-site <domain>`); test `tests/ga4-detect.test.ts`.

**Interfaces:** `fetchHtml(url, opts?): Promise<{ status: number | null; html: string; error?: string }>` (same 403 curl fallback; `fetchPage` uses it). `measurementIds(html: string): string[]` (unique `G-[A-Z0-9]{6,12}`). `resolveGa4(ids: string[], host: string, props: { propertyId: string; measurementIds: string[]; streamUris: string[] }[]): string | null` — measurement id match first, else a stream whose URI host minus `www.` equals `host` minus `www.`.

- [ ] Tests: ids deduped from gtag and config snippets; GTM-only page resolves by stream host; no match returns null.
- [ ] Implement; `--ga4-from-site` reads `sites/<domain>/config.json` siteUrl, fetches home, resolves, writes `ga4PropertyId`, prints one line; Admin API disabled prints the enable link and exits 0 (GA4 is optional).
- [ ] Tests pass; commit `feat: find the GA4 property from the site itself`.

### Task 3: Site to property matching

**Files:** Create `scripts/lib/match.ts`; modify `scripts/sites.ts` (`--url <input>`); test `tests/match.test.ts`.

**Interfaces:** `matchProperty(input: string, properties: string[]): { siteUrl: string | null; reason: string }`. Normalise input (strip scheme, path, `www.`, lowercase). Prefer `sc-domain:<registrable host>` when present, else a URL-prefix property whose host minus `www.` matches. None: `siteUrl` null with a reason naming what was seen.

- [ ] Tests: `rtlequipment.com`, `https://www.rtlequipment.com/x` → `https://www.rtlequipment.com/`; both kinds present → domain property; subdomain `parts.x.com` does not match `https://www.x.com/` but does match `sc-domain:x.com`; no match reason lists properties.
- [ ] `sites.ts --url` creates the config if absent (keeps an existing one) and prints the domain folder.
- [ ] Commit `feat: match a typed site to its Search Console property`.

### Task 4: OAuth client install

**Files:** Create `scripts/lib/client-install.ts`; modify `scripts/setup.ts` (`--install-client [path]`); test `tests/setup.test.ts`.

**Interfaces:** `findClientFile(dirs: string[]): string | null` (newest `client_secret*.json`), `installClient(file: string): { ok: true } | { ok: false; reason: string }` copies to `clientPath()`; refuses a `web` client with "This is a Web application client. Create a Desktop app client instead (APIs & Services, Credentials, Create credentials, OAuth client ID, Desktop app)." Default search dirs: `~/Downloads`, `~/OneDrive/Downloads`.

- [ ] Tests: picks newest of two; refuses web; refuses non-client JSON; installs installed-type.
- [ ] Commit `feat: install the downloaded OAuth client for the user`.

### Task 5: doctor

**Files:** Create `scripts/doctor.ts`, `scripts/lib/doctor.ts`; test `tests/doctor.test.ts`.

**Interfaces:** `diagnose(deps: { nodeVersion: string; pluginRoot: string; home: string; listProperties: () => Promise<string[]>; site?: string }): Promise<Doctor>`. `Doctor = { node: {version, ok}, deps: boolean, home: string, client: { exists: boolean; type: 'installed' | 'web' | 'invalid' | null }, signin: { ok: boolean; properties: string[]; error?: string }, site: null | { input; siteUrl: string | null; domain: string | null; configExists; brandTerms: boolean; notes: boolean; market: boolean; ga4PropertyId: string | null }, gemini: { keySet: boolean; source; offered: boolean; mode: string | null }, next: 'node' | 'deps' | 'client' | 'signin' | 'site' | 'profile' | 'gemini' | 'ready' }`. `cadieHome(env)` lives in `paths.ts`: `CADDIE_HOME` or `~/Documents/Caddie`. CLI prints JSON; `--site <input>`.

- [ ] Tests for `next`: old node → node; no client → client; web client → client; listProperties throws → signin with error; no matching property → site; config without brandTerms → profile; key missing and not offered → gemini; all set → ready.
- [ ] Commit `feat: doctor reports what is set up and what comes next`.

### Task 6: profile facts

**Files:** Create `scripts/profile.ts`, `scripts/lib/profile.ts`; test `tests/profile.test.ts`.

**Interfaces:** `profileFacts(home: PageExtract & { links?: string[] }, about: PageExtract | null, queries: { query: string; impressions: number }[]): Profile` with `{ names: string[]; addresses: string[]; phones: string[]; headings: string[]; titles: string[]; topQueries: string[] }`, names and addresses from JSON-LD Organization/LocalBusiness and title suffixes. CLI `--site <domain>` fetches home and the first link whose path contains `about`, pulls the last 28 days of queries with `pullWindow` (cached), writes `sites/<domain>/profile.json`.

- [ ] Test with an HTML fixture holding LocalBusiness JSON-LD and a title "Widgets | Acme Co".
- [ ] Commit `feat: profile facts for the business card`.

### Task 7: report data and site-wide checks

**Files:** Create `scripts/lib/report-data.ts`, `scripts/lib/sitewide.ts`; test `tests/report-data.test.ts`.

**Interfaces:** `loadReportData(siteDir: string, date: string): ReportData` reading `runs/<date>/{find,gaps,monday}` when present. `ReportData = { host, date, find: null | { pages: FindPage[]; totalQueries; brandQueries; window; skipped: string[]; aiMode; aiAsked; aiMentions }, gaps: null | { asked; open; briefs: Brief[] }, monday: null | { memo: string; thisWeek; lastWeek; ga4 }, sitewide: Issue[] }`. `FindPage = { rank, slug, title, url, clicks, oneLine, effort: '5 minutes' | 'About 30 minutes' | 'Ask your web provider', why: string, keyFixes: { label: string; before: string | null; after: string }[] }` — `oneLine` from README, `why` from the page file's "Why it sits here", `keyFixes` the first two fixes of the page file. `effortFor(kinds: string[], text: string)`: redirect, schema, or text mentioning template/Dealer Spike/web provider → provider; h2/answer/faq → 30 minutes; else 5 minutes. `Brief = { title, url, question, why, firstParagraph, isEdit }` parsed from brief files. `sitewideIssues(extracts: PageExtract[]): Issue[]`, `Issue = { title: string; detail: string; count: number }`: shared meta description on 3+ pages, titles over 60 on 3+, pages saying "not found"/"no longer available" with status ok, duplicate titles.

- [ ] Tests against `docs/example-run/summitplumbing.example` copied to a temp site dir: 10 pages ranked by clicks, every `oneLine` filled, 3 briefs with first paragraphs, memo present; missing gaps/monday folders yield null; sitewide on synthetic extracts.
- [ ] Commit `feat: report data from the three runs, and site-wide checks`.

### Task 8: combined report and implementation pack

**Files:** Create `scripts/lib/caddie-report.ts`; modify `scripts/report.ts`; test `tests/report.test.ts`.

**Interfaces:** `renderCaddieReport(d: ReportData): string` (HTML). Sections, in order, with ids for the contents links: cover "Your top 5 moves this week" + numbers strip; contents; how the site is doing (monday); top fixes (5 pages); every other page (checklist table); site-wide problems; new pages to create; what Caddie checked; next week. Empty sections are left out of both body and contents. `report.ts --report --site <domain> [--date]` writes `Caddie Report - <host> - <date>.html/.pdf` in `runs/<date>/`; `--run <find dir>` writes `Implementation Pack - <host> - <date>.html/.pdf`. `printToPdf` adds `--generate-pdf-document-outline`. `--open` opens the combined report when `--report`, else the pack.

- [ ] Tests: HTML contains the five top moves in click order, contents links to every rendered section id, checklist holds pages 6+, gap cards hold first paragraphs; with no gaps/monday the sections and their contents entries are absent. A browser-gated test builds the PDF for the example run and asserts at most 10 pages (count `/Type /Page` objects).
- [ ] Rebuild the RTL 2026-10-09 report and read it as the owner; fix anything I would not hand over.
- [ ] Commit `feat: one combined Caddie report, with the full scorecard as the implementation pack`.

### Task 9: orchestration command and skill

**Files:** Create `commands/caddie.md`, `skills/caddie-run/SKILL.md`; modify `commands/find.md` (pack file name), `commands/gaps.md`, `commands/monday.md` (no change in behaviour; mention they are called from `/caddie`).

The skill's description triggers on "run my site … through caddie", "caddie my site", "full caddie process". Its body: run `doctor.ts --site`, then the step for `next`, looping until `ready`; the welcome copy; each Google step with its URL (`https://console.cloud.google.com/projectcreate`, `https://console.cloud.google.com/apis/library/searchconsole.googleapis.com`, `.../analyticsdata.googleapis.com`, `.../analyticsadmin.googleapis.com`, `https://console.cloud.google.com/auth/branding`, `https://console.cloud.google.com/auth/audience`, `https://console.cloud.google.com/auth/clients/create`), opened with the OS opener, one or two sentences each, wait for "done"; the error playbook; the business card shape and the one question; the Gemini offer and citations line; the three commands' steps without opening the pack; `report.ts --report --site <domain> --pdf --open`; the five-line finish.

- [ ] Dry-read the command as a new user would, then run the doctor-driven path on this machine with `CADDIE_CONFIG_DIR` pointed at an empty folder until it asks for the project (proves the first-run branch), and with the real config for RTL (proves the returning branch reaches `ready`).
- [ ] Commit `feat: /caddie runs the whole process and walks new users through setup`.

### Task 10: docs, check, release

**Files:** Modify `SETUP.md`, `README.md`, `CHANGELOG.md`, `DECISIONS.md`, `package.json` (check script), plugin version 0.3.0.

- [ ] `npm run check` additionally builds the combined report from the example run.
- [ ] README leads with the one sentence; SETUP mirrors the guided steps.
- [ ] Fresh clone, `npm install`, `npm run check` green.
- [ ] Commit `release: 0.3.0`, tag, push.
