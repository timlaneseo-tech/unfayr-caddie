# caddie: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free Claude Code plugin whose `/find` command turns Search Console striking-distance queries into paste-ready page edits, with a ledger that the future `/monday` memo reads.

**Architecture:** Deterministic TypeScript scripts (run by Node's native type stripping, no build) fetch Search Console data, score candidates, extract pages, and query Gemini with grounding, each writing JSON into `sites/<domain>/`. The command markdown then tells Claude, inside the user's own session, what to read and what to write, guided by three skills. `/gaps` and `/monday` are stubs that point to designs in `docs/`.

**Tech Stack:** Node >= 22.18 (ESM, `.ts` run directly), `googleapis`, `@google/genai`, `node-html-parser`, `vitest`, `typescript` (typecheck only).

**Spec:** the kickoff brief, preserved verbatim at `docs/spec.md`.

## Global Constraints

- Node 22.18+, ESM, TypeScript run through native type stripping: erasable syntax only (no enums, namespaces, parameter properties), every relative import carries its `.ts` extension, `tsc --noEmit` is the only compile step.
- Runtime dependencies: `googleapis`, `@google/genai`, `node-html-parser`. Dev: `vitest`, `typescript`, `@types/node`. Anything else needs a line in `DECISIONS.md`.
- Zero running cost: Search Console API, GA4 Data API, Gemini free grounding quota only. No Anthropic API calls anywhere.
- No scraping of Google Search, Maps, ChatGPT or AI product UIs. Fetch only the user's own pages, pages the user names, and official APIs. Grounding redirect URLs returned by the Gemini API count as official API output.
- No telemetry, accounts, or hosted service. All output lands in the working directory under `sites/`.
- Credentials live in the user config dir (`%APPDATA%\caddie` on Windows, `$XDG_CONFIG_HOME/caddie` or `~/.config/caddie` elsewhere), never in the repo. `.gitignore` still blocks `client*.json`, `token*.json`, `*.secret.json`, `.env*`.
- MIT license. Every generated document ends with the single line `Built by Unfayr · unfayr.com`.
- Command files short; `SKILL.md` under 500 lines; explain why, not rules in capitals.
- Commit after each task. Push to main, no PRs.

## Review Focus

Inputs the spec implies but no obvious test covers. Each line is pinned to a test in the task that owns it.

1. A query whose GSC `page` is a URL with a query string, fragment, or trailing slash variant of a fetched page should group with that page, not split into several candidates (Task 6).
2. A site with fewer than 20 queries at any impressions level must still produce at least one candidate instead of an empty run (Task 6).
3. A fetched page that returns 200 but is a JavaScript shell with no `<h1>` or body text must be recorded as `thin` and still get a page file written from GSC data alone (Task 7).
4. A Gemini response with no `groundingMetadata` (model answered from memory) must record `cited: []`, `onSite: false`, not throw (Task 8).
5. `ledger.ts record` run twice on the same run directory must not duplicate entries (Task 9).

---

## File structure

```
.claude-plugin/plugin.json        manifest (name, version, author, license)
.claude-plugin/marketplace.json   lets `/plugin marketplace add <owner>/caddie` work on this one repo
commands/find.md                  the /find command: run scripts, then write
commands/gaps.md, monday.md       stubs pointing at docs/
skills/answer-first-copy/SKILL.md how to write a quotable 40-80 word answer
skills/page-diff/SKILL.md         before/after blocks, FAQ + JSON-LD, size of a change
skills/intent-match/SKILL.md      diagnosing why a page sits at 4-15, brand/new-page judgement
scripts/setup.ts                  OAuth desktop loopback, saves token to config dir
scripts/sites.ts                  list GSC properties, create sites/<domain>/config.json
scripts/gsc-pull.ts               two 28-day windows, paginated, cached under data/
scripts/find-candidates.ts        scoring, brand marking, wrong-page detection -> candidates.json
scripts/fetch-page.ts             fetch + extract each candidate page -> pages/<hash>.json
scripts/ai-check.ts               Gemini grounded answers for top 3 queries/page -> ai-check.json
scripts/ledger.ts                 `record <runDir>` ingests changes.json into ledger.json
scripts/find.ts                   orchestrator: pull -> candidates -> fetch -> ai-check -> run dir + README
scripts/lib/paths.ts              config dir, site dir, run dir helpers
scripts/lib/config.ts             SiteConfig type, defaults, load/save
scripts/lib/ctr.ts                CTR curve + opportunity score
scripts/lib/brand.ts              brand-term detection
scripts/lib/gsc.ts                date windows, paginated query, aggregation
scripts/lib/extract.ts            HTML -> PageExtract
scripts/lib/questions.ts          query -> user phrasing, is-question test
scripts/lib/grounding.ts          Gemini response -> AiCheckResult, redirect resolution
scripts/lib/ledger.ts             Ledger types, append, dedupe
scripts/lib/sample.ts             fixture-backed replacements for the network steps
scripts/lib/args.ts               tiny flag parser (no dependency)
fixtures/summitplumbing.example/  seed.json, gsc-rows.json, pages/*.html, ai-check.json
fixtures/slotwise.example/        same, SaaS scheduling blog
fixtures/build.ts                 seed.json -> gsc-rows.json (deterministic)
tests/*.test.ts                   vitest
docs/spec.md, docs/gaps.md, docs/monday.md, docs/plain-skills.md
README.md, SETUP.md, DECISIONS.md, PLAN.md, LICENSE
```

Workspace written by the scripts (never committed, except nothing: `sites/` is gitignored in this repo only; users keep theirs):

```
sites/<domain>/config.json
sites/<domain>/data/gsc-<start>_<end>.json
sites/<domain>/runs/<YYYY-MM-DD>/find/candidates.json
sites/<domain>/runs/<YYYY-MM-DD>/find/pages/<slug>.json
sites/<domain>/runs/<YYYY-MM-DD>/find/ai-check.json
sites/<domain>/runs/<YYYY-MM-DD>/find/<slug>.md        written by Claude
sites/<domain>/runs/<YYYY-MM-DD>/find/changes.json     written by Claude, read by ledger.ts
sites/<domain>/runs/<YYYY-MM-DD>/find/README.md
sites/<domain>/ledger.json
```

## Shared types (scripts/lib/types.ts)

```ts
export interface SiteConfig {
  siteUrl: string;                 // exactly as GSC returns it, e.g. "sc-domain:example.com"
  domain: string;                  // folder name, e.g. "example.com"
  brandTerms: string[];
  locale: string;                  // BCP 47, default "en-US"
  ga4PropertyId?: string;
  thresholds: {
    positionMin: number;           // 4
    positionMax: number;           // 15
    minImpressions: number;        // 20
    maxPages: number;              // 25
    brandCtr: number;              // 0.40  position<=2 with CTR above this is brand
    queriesPerPageForAi: number;   // 3
  };
  ai: { model: string; dailyCap: number };   // "gemini-2.5-flash", 1000
}

export interface GscRow { query: string; page: string; date: string; clicks: number; impressions: number; ctr: number; position: number }

export interface QueryStat {
  query: string; page: string;
  clicks: number; impressions: number; ctr: number; position: number;   // current 28 days
  prior: { clicks: number; impressions: number; position: number } | null;
  brand: boolean; isQuestion: boolean; score: number;
}

export interface PageCandidate {
  page: string; slug: string; score: number; impressions: number; clicks: number;
  queries: QueryStat[];                       // sorted by score desc
  newPage: { query: string; reason: string }[];   // wrong-page flags
}

export interface CandidatesFile {
  site: string; generatedAt: string; window: { start: string; end: string }; priorWindow: { start: string; end: string };
  minImpressions: number; totalQueries: number; brandQueries: number; pages: PageCandidate[]; skipped: string[];
}

export interface PageExtract {
  url: string; fetchedAt: string; status: 'ok' | 'thin' | 'failed'; httpStatus: number | null; error?: string;
  title: string | null; metaDescription: string | null; canonical: string | null; h1: string | null;
  headings: { level: number; text: string }[]; paragraphs: string[]; wordCount: number;
  jsonLd: unknown[]; faq: { question: string; answer: string }[]; contentHash: string | null;
}

export interface AiCheckResult {
  page: string; query: string; asked: string; model: string;
  answer: string; cited: { url: string; host: string; title: string | null }[];
  onSite: boolean; competitors: string[]; error?: string;
}
export interface AiCheckFile { site: string; model: string; results: AiCheckResult[]; skipped: number; skippedReason: string | null; usedToday: number; dailyCap: number }

export interface LedgerEntry {
  id: string;                       // sha1(page|kind|date|summary) first 12 chars
  date: string; run: string;        // run dir relative to site dir
  page: string; kind: 'title' | 'meta' | 'h2' | 'answer' | 'faq' | 'faq-jsonld' | 'new-page';
  queries: string[]; summary: string;
  contentHash: string | null; positionAtTime: number | null; impressionsAtTime: number;
  status: 'proposed';
}
export interface Ledger { site: string; entries: LedgerEntry[] }
```

`changes.json` (written by Claude) is `Omit<LedgerEntry, 'id' | 'date' | 'run' | 'contentHash' | 'positionAtTime' | 'impressionsAtTime' | 'status'>[]`; `ledger.ts record` fills the rest from `candidates.json` and `pages/`.

---

### Task 1: Skeleton, manifest, license, DECISIONS

**Files:** `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `commands/{find,gaps,monday}.md` (one-paragraph placeholders), `scripts/lib/{paths,args,types}.ts`, `tests/paths.test.ts`, `DECISIONS.md`, `docs/spec.md`.

**Produces:** `configDir(): string`, `siteDir(cwd, domain): string`, `runDir(siteDir, date, command): string`, `todayIso(): string`, `parseArgs(argv): { flags: Record<string,string|boolean>; positional: string[] }`.

- [ ] `package.json`: `"type": "module"`, `"engines": { "node": ">=22.18" }`, scripts `test: vitest run`, `typecheck: tsc --noEmit`, `check: npm run typecheck && npm run test && node scripts/find.ts --sample summitplumbing.example`, deps as in Global Constraints.
- [ ] `tsconfig.json`: `module: nodenext`, `target: es2022`, `strict`, `noEmit`, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `types: ["node"]`, include `scripts`, `tests`, `fixtures`.
- [ ] `plugin.json`: name `caddie`, version `0.1.0`, description, author Unfayr, license MIT, repository, keywords. `marketplace.json`: name `caddie`, one plugin entry with `"source": "./"`.
- [ ] `tests/paths.test.ts`: `configDir()` ends with `caddie`; `siteDir('/w','example.com')` is `/w/sites/example.com`; `runDir` composes `runs/2026-10-07/find`. Run `npx vitest run` -> PASS.
- [ ] `npm install`; `claude plugin validate .` -> `Validation passed`.
- [ ] Commit: `chore: scaffold caddie plugin`.

### Task 2: OAuth setup and site picker

**Files:** `scripts/setup.ts`, `scripts/sites.ts`, `scripts/lib/auth.ts`, `scripts/lib/config.ts`, `tests/config.test.ts`.

**Produces:** `getAuth(): Promise<OAuth2Client>` (loads `configDir()/client.json` + `token.json`, refreshes, throws a readable error naming `SETUP.md` when missing); `defaultConfig(siteUrl): SiteConfig`; `loadConfig(siteDir)`, `saveConfig(siteDir, cfg)`; `domainFromSiteUrl('sc-domain:example.com') === 'example.com'`, `('https://www.example.com/') === 'www.example.com'`.

- [ ] Test `domainFromSiteUrl` both forms and `defaultConfig` thresholds equal the spec values (4, 15, 20, 25, 0.40, 3; model `gemini-2.5-flash`, cap 1000).
- [ ] `setup.ts`: read client JSON (`installed` or `web` key), start `http.createServer` on `127.0.0.1:0`, build auth URL with scopes `https://www.googleapis.com/auth/webmasters.readonly` and `https://www.googleapis.com/auth/analytics.readonly`, `access_type: 'offline'`, `prompt: 'consent'`; print URL and try to open it with `start`/`open`/`xdg-open`; on callback exchange code, write `token.json` with mode `0o600`, respond with a plain "You can close this tab", exit 0. `--check` flag: load token, call `webmasters.sites.list`, print count.
- [ ] `sites.ts`: list properties as a numbered table (siteUrl, permissionLevel); `--pick <n>` or `--site <siteUrl>` writes `sites/<domain>/config.json` from `defaultConfig`; with neither, print the table and the command to run.
- [ ] Manual verification against the user's property once the client JSON exists: `node scripts/setup.ts` then `node scripts/sites.ts --pick 1` creates the folder.
- [ ] Commit: `feat: oauth setup and site picker`.

### Task 3: CTR curve and opportunity score

**Files:** `scripts/lib/ctr.ts`, `tests/ctr.test.ts`.

**Produces:** `CTR_BY_POSITION: number[]` (index 1..20), `ctrAt(position: number): number` (linear interpolation, clamp 1..20), `opportunity(impressions, position, target = 3): number` = `impressions * max(0, ctrAt(target) - ctrAt(position))`.

Curve: First Page Sage, "Google Click-Through Rates by Ranking Position", September 2026 edition (https://firstpagesage.com/reports/google-click-through-rates-ctrs-by-ranking-position/): 7.1, 3.0, 1.7, 1.1, 0.7, 0.6, 0.4, 0.3, 0.2, 0.2 for 1..10; 11..20 extrapolated as a straight line from 0.15 to 0.05, marked in the code comment. Values stored as fractions.

- [ ] Tests: `ctrAt(1) === 0.071`; `ctrAt(3.5)` is between `ctrAt(3)` and `ctrAt(4)`; `ctrAt(40) === ctrAt(20)`; `opportunity(1000, 8)` equals `1000 * (0.017 - 0.003)` within 1e-9; `opportunity(1000, 2) === 0`.
- [ ] Run -> FAIL (module missing); implement; run -> PASS; commit `feat: ctr curve and opportunity score`.

### Task 4: Brand detection

**Files:** `scripts/lib/brand.ts`, `tests/brand.test.ts`.

**Produces:** `brandTokens(domain: string, configured: string[]): string[]` (domain label split on non-letters plus whole label, lowercased, drop tokens of length < 3 and the TLD; configured terms lowercased); `isBrandQuery(query, tokens, stat: { position, ctr }, brandCtr): boolean` true when any token appears as a whole word or as a substring of a word of length >= 5 in the query, or when `position <= 2 && ctr >= brandCtr`.

- [ ] Tests: `brandTokens('summitplumbing.example', ['Summit Plumbing'])` contains `summitplumbing`, `summit plumbing`; `isBrandQuery('summit plumbing reviews', ...)` true; `isBrandQuery('water heater repair', tokens, {position: 1.2, ctr: 0.55}, 0.4)` true; `isBrandQuery('water heater repair', tokens, {position: 1.2, ctr: 0.2}, 0.4)` false; `'sum'` alone never matches.
- [ ] Implement, PASS, commit `feat: brand query detection`.

### Task 5: Search Console pull with pagination and cache

**Files:** `scripts/lib/gsc.ts`, `scripts/gsc-pull.ts`, `tests/gsc.test.ts`.

**Produces:**
- `windows(today: Date, lag = 3): { current: {start,end}; prior: {start,end} }` (end = today - lag days, 28-day windows, ISO dates).
- `fetchAllRows(queryPage: (startRow: number) => Promise<GscRow[]>, rowLimit = 25000): Promise<GscRow[]>` loops until a page returns fewer than `rowLimit` rows.
- `aggregate(rows: GscRow[]): Map<string, { query, page, clicks, impressions, position }>` keyed `query\u0000page`, position impression-weighted.
- `pullWindow(auth, siteUrl, window, dataDir): Promise<GscRow[]>` reads `data/gsc-<start>_<end>.json` if present, else queries with dimensions `['query','page','date']`, `rowLimit 25000`, `startRow`, saves and returns.
- CLI `gsc-pull.ts --site <domain>` writes both windows and prints row counts.

- [ ] Tests: `windows(new Date('2026-10-07'))` -> current `2026-09-07..2026-10-04`, prior `2026-08-10..2026-09-06`; `fetchAllRows` with a fake returning 25000, 25000, 12 rows is called 3 times with startRow 0, 25000, 50000 and returns 50012 rows; a fake returning exactly 0 rows first is called once; `aggregate` weights position by impressions (two rows 100 imp @ 4, 300 imp @ 8 -> 7).
- [ ] Implement with `google.searchconsole('v1').searchanalytics.query`; PASS; commit `feat: search console pull with pagination and daily cache`.

### Task 6: Fixtures and candidate selection

**Files:** `fixtures/summitplumbing.example/{seed.json,gsc-rows.json}`, `fixtures/slotwise.example/{seed.json,gsc-rows.json}`, `fixtures/build.ts`, `scripts/lib/questions.ts`, `scripts/find-candidates.ts`, `tests/candidates.test.ts`, `tests/questions.test.ts`.

**Produces:**
- `fixtures/build.ts`: reads `seed.json` (`{ domain, siteUrl, pages: {url,title,h1}[], queries: {query,page,position,impressions28,ctr?,trend?: 'up'|'down'|'flat', brand?: boolean}[] }`) and writes 56 days of `GscRow` with a seeded PRNG (mulberry32, seed 7), daily impressions drawn around `impressions28/28`, prior-window position shifted by `trend`. ~300 queries per site; service site mixes brand, "near me", cost, how-to, emergency; SaaS site mixes definitions, comparisons, "vs", templates, how-to, and a handful of queries whose best page is the wrong post.
- `isQuestion(q): boolean` (starts with who/what/when/where/why/how/can/does/is/are/should/do, or ends with `?`); `toUserQuestion(q): string` per the rules: question -> capitalised + `?`; `how to X` -> `How do I X?`; `X cost|price|pricing` -> `How much does X cost?`; `best X` -> `What is the best X?`; `X near me` -> `Who offers X near me?`; else `Can you tell me about X?`.
- `selectCandidates(current: GscRow[], prior: GscRow[], cfg: SiteConfig): CandidatesFile` implementing: normalise page URLs (strip fragment, query string, trailing slash except root) before aggregation; brand marking via Task 4; minImpressions = `min(cfg.thresholds.minImpressions, p80(query impressions))`; keep non-brand queries with position in `[positionMin, positionMax]` and impressions >= minImpressions; score via Task 3; group by page, sum, sort, cap `maxPages`; `skipped` lists reasons with counts.
- `flagNewPages(file: CandidatesFile, extracts: Map<string, PageExtract>): CandidatesFile`: for each page's queries, tokens of query (stopwords removed) vs tokens of title + h1 (fallback: URL slug); if fewer than 1 content token overlaps and the query has >= 2 content tokens and impressions >= 2 × minImpressions, add to `newPage` with reason `"no title/H1 word matches; best-ranking URL is a different topic"`.
- CLI `find-candidates.ts --site <domain> [--run <dir>]`.

- [ ] Tests (Review Focus 1, 2): URLs `https://x/a?utm=1`, `https://x/a/`, `https://x/a#top` aggregate as one page; a 12-query site with impressions 3..14 still yields >= 1 candidate because p80 lowers the floor; brand queries are present with `brand: true` and excluded from scores; position 3.9 excluded, 4.0 included; cap honoured; `toUserQuestion` for the five rule cases; `flagNewPages` flags `"invoice late fee wording"` whose best page is the scheduling-app pricing post.
- [ ] Build fixtures (`node fixtures/build.ts`), commit them. Implement, PASS, commit `feat: fixtures, scoring and candidate selection`.

### Task 7: Page fetch and extraction

**Files:** `scripts/lib/extract.ts`, `scripts/fetch-page.ts`, `fixtures/*/pages/*.html` (6-8 pages per site, written to contain the flaws the diagnoses need: answer buried in paragraph six, title promising something else, no heading matching the question, missing FAQ), `tests/extract.test.ts`.

**Produces:** `extract(html: string, url: string): PageExtract` (status `thin` when `wordCount < 120` or no h1 and no paragraphs); `contentHash = sha256(normalised main text)`; `fetchPage(url, { timeoutMs = 15000, userAgent = 'caddie/0.1 (+https://github.com/<owner>/caddie; polite fetch of your own pages)' }): Promise<PageExtract>` (captures `failed` with `error`); `slugFor(url): string` (path-based, `index` for root). CLI `fetch-page.ts --site <domain> --run <dir>` writes `pages/<slug>.json`; `--sample` reads `fixtures/<domain>/pages/<slug>.html` instead.

- [ ] Tests (Review Focus 3): on each fixture page, title/meta/canonical/h1/headings/wordCount/jsonLd/faq are the expected values; a JS-shell fixture (`<div id="app"></div>`) returns `status: 'thin'`, `h1: null`, `wordCount: 0`; same HTML twice -> same `contentHash`; a changed paragraph -> different hash; `slugFor('https://x/blog/a-b/')` is `blog-a-b`.
- [ ] Implement with `node-html-parser`, PASS, commit `feat: page fetch and extraction`.

### Task 8: AI answer check

**Files:** `scripts/lib/grounding.ts`, `scripts/ai-check.ts`, `fixtures/*/ai-check.json`, `tests/grounding.test.ts`.

**Produces:**
- `parseGrounding(resp: { text?: string; candidates?: ... }, siteHost: string): Omit<AiCheckResult, 'page'|'query'|'asked'|'model'>` reading `candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}`; `host` from `title` when `uri` is a `grounding-api-redirect` URL; `onSite` when any host (minus `www.`) equals `siteHost`; `competitors` = other hosts, deduped.
- `resolveRedirect(uri, timeoutMs = 5000): Promise<string | null>` does `fetch(uri, { redirect: 'manual' })` and returns the `location` header; used to upgrade `host`/`url` after parsing, failures leave the title host.
- `Usage` file `configDir()/gemini-usage.json` `{ date, count }`; `canSpend(usage, cap, today)`.
- CLI `ai-check.ts --site <domain> --run <dir>`: skip entirely with a clear message when `GEMINI_API_KEY` is unset (writes `ai-check.json` with `skippedReason: 'GEMINI_API_KEY not set'`); otherwise top `queriesPerPageForAi` non-brand queries per page via `toUserQuestion`, `ai.models.generateContent({ model, contents, config: { tools: [{ googleSearch: {} }] } })`, stops at `dailyCap` or on HTTP 429 and records `skipped`. `--sample` copies `fixtures/<domain>/ai-check.json`.

- [ ] Tests (Review Focus 4): a response with no `groundingMetadata` -> `cited: []`, `onSite: false`, `competitors: []`; a response citing `vertexaisearch...redirect` with title `competitor.com` and another with title `summitplumbing.example` -> `onSite: true`, competitors `['competitor.com']`; `canSpend({date: today, count: 1000}, 1000)` false, `({date: yesterday, count: 1000}, 1000)` true.
- [ ] Write `fixtures/*/ai-check.json` by hand: 3 queries for each of the top 6 pages, mixing uncited, competitor-cited and on-site answers.
- [ ] Implement, PASS, commit `feat: gemini grounded answer check with quota guard`.

### Task 9: Ledger

**Files:** `scripts/lib/ledger.ts`, `scripts/ledger.ts`, `tests/ledger.test.ts`.

**Produces:** `loadLedger(siteDir): Ledger`, `appendEntries(ledger, entries): { ledger, added: number; duplicates: number }` (dedupe on `id`), `entryId(e): string`, `recordRun(siteDir, runDir): Promise<{added, duplicates}>` which reads `changes.json`, `candidates.json` and `pages/*.json`, fills `contentHash`, `positionAtTime` (best position among the entry's queries), `impressionsAtTime`, `date`, `run`, `status: 'proposed'`. CLI `ledger.ts record --site <domain> --run <dir>` and `ledger.ts list --site <domain>`.

- [ ] Tests (Review Focus 5): record a temp run twice -> second call `added: 0, duplicates: n`; `contentHash` comes from the page extract; missing extract -> `contentHash: null` and no throw; `changes.json` entry with an unknown `kind` is rejected with the entry index in the error.
- [ ] Implement, PASS, commit `feat: ledger with idempotent run recording`.

### Task 10: Orchestrator, sample mode, run README, `npm run check`

**Files:** `scripts/find.ts`, `scripts/lib/sample.ts`, `scripts/lib/readme.ts`, `tests/readme.test.ts`.

**Produces:** `node scripts/find.ts [--site <domain>] [--sample <fixtureDomain>] [--date YYYY-MM-DD] [--no-ai]` runs pull -> selectCandidates -> fetch -> flagNewPages -> ai-check, writes everything under the run dir, then `writeRunReadme(runDir, candidates, aiCheck, extracts)` producing a table (rank, page, score, top query, position, what to do = `_pending_`), totals, skipped, "run again" command, and the Unfayr footer. Prints the run dir and `Next: Claude writes the page files` as its last line. `--sample` substitutes fixture readers for `pullWindow`, `fetchPage`, and the Gemini call, writes to `sites/<fixtureDomain>/` in cwd, and creates `config.json` from the seed if absent.

- [ ] Test: `writeRunReadme` output contains one row per page, the `Built by Unfayr · unfayr.com` last line, and the skipped reasons.
- [ ] `npm run check` passes end to end on a clean clone (typecheck, tests, sample run).
- [ ] Commit: `feat: find orchestrator and sample mode`.

### Task 11: Skills and `commands/find.md`

**Files:** `skills/answer-first-copy/SKILL.md`, `skills/page-diff/SKILL.md`, `skills/intent-match/SKILL.md`, `commands/find.md`.

Use `superpowers:writing-skills` for the SKILL.md files and draw the domain content from the installed `ai-seo` and `schema` skills. Each SKILL.md: frontmatter `name`, `description`; under 500 lines; explains why.

- [ ] `intent-match`: how to read the queries table and the extract to write the two-sentence diagnosis; the four diagnosis patterns named in the spec; when a cluster is a new page rather than an edit; why brand queries get no effort.
- [ ] `answer-first-copy`: the 40-80 word answer paragraph that a search engine or assistant can quote: lead with the direct answer, one concrete number or condition, no preamble, the page's own facts only (never invent prices, dates, credentials); H2 phrased as the question.
- [ ] `page-diff`: before/after blocks per change (title <= 60 chars, meta 140-160, H2, answer, FAQ when >= 3 questions, FAQ JSON-LD using existing schema if present); each change pasteable in a minute; verification line wording; the `changes.json` entry per change.
- [ ] `commands/find.md`: frontmatter `description`, `argument-hint: [--site domain] [--sample]`, `allowed-tools: Bash(node *), Read, Write, Glob`. Body: ensure `node_modules` exists in `${CLAUDE_PLUGIN_ROOT}` (run `npm install --prefix` if not); run `node "${CLAUDE_PLUGIN_ROOT}/scripts/find.ts" $ARGUMENTS`; read `candidates.json`, `pages/*.json`, `ai-check.json`; load the three skills; for each page write `<slug>.md` with the five numbered sections from the spec; write `changes.json`; replace `_pending_` cells in README.md with the one-line diagnosis; run `ledger.ts record`; end with the footer line on every file and a three-line summary to the user.
- [ ] Run `/find --sample summitplumbing.example` in this session via `claude --plugin-dir .`; read every page file as the site owner; fix skills until nothing would embarrass you pasted into a live site. Repeat with `slotwise.example`.
- [ ] Commit: `feat: writing skills and /find command`.

### Task 12: Documentation and stubs

**Files:** `README.md`, `SETUP.md`, `docs/gaps.md`, `docs/monday.md`, `docs/plain-skills.md`, `commands/gaps.md`, `commands/monday.md`.

- [ ] `README.md` for a marketer: what it does in three sentences, the 90-second demo (`git clone`, `npm install`, `claude --plugin-dir .`, `/find --sample summitplumbing.example`), the three-step real setup (Google Cloud project -> `node scripts/setup.ts` -> `node scripts/sites.ts`), what it costs (nothing, with the Gemini quota numbers), what it never does, both install paths (`/plugin marketplace add <owner>/caddie` then `/plugin install caddie@caddie`; or copy `skills/` + `commands/` into `.claude/` per `docs/plain-skills.md`).
- [ ] `SETUP.md`: click-by-click Google Cloud: create project, enable "Google Search Console API" and "Google Analytics Data API", OAuth consent screen (External, test user = you), create OAuth client (Desktop app), download JSON, save as `<configDir>/client.json`, run setup, run sites. Gemini key from AI Studio into `GEMINI_API_KEY`.
- [ ] `docs/gaps.md`, `docs/monday.md`: data sources, scripts, outputs, what the command writes, open questions. `/monday` design reads `ledger.json`, re-fetches each proposed page, compares `contentHash`, pulls position for exactly those queries.
- [ ] `commands/gaps.md`, `commands/monday.md`: say the command is coming, link the design file, say what `/find` already records for it.
- [ ] Commit: `docs: README, SETUP, designs for gaps and monday, command stubs`.

### Task 13: Finish

- [ ] `npm run check` green; `claude plugin validate .` passes; `git status` clean.
- [ ] Push to `main` on the remote the user confirms.
