# Decisions

Routine calls made while building, with the reason. Newest at the bottom.

## 2026-10-07

- **Working name `strike`.** Short, lowercase, from "striking distance", the band of positions `/find` works in. Easy to rename: it appears in `plugin.json`, `marketplace.json`, the config-dir name, the user agent and the README.
- **Repo lives at `C:\Users\TimLane\strike`.** No empty repo existed locally or on GitHub, so one was initialised on `main`. Remote to be confirmed by Tim.
- **CTR curve: First Page Sage, September 2026 edition.** It is published, current, and already reflects AI-answer SERPs. Positions 11 to 20 are not in the report, so they are extrapolated linearly from 0.15% to 0.05% and the code says so. The curve only ranks opportunities relative to each other; absolute values do not change the output order much.
- **Default Gemini model `gemini-2.5-flash`.** On the free tier its grounded requests carry a 1,500 requests-per-day allowance, versus 5,000 per month shared across the 3.x models. Daily, per-site work fits the 2.5 shape better. Model is configurable per site in `config.json`.
- **Daily cap defaults to 1,000 grounded calls** across all sites on the machine, tracked in the config dir, leaving headroom under the 1,500 quota for retries and other uses of the same key.
- **Extra runtime dependency: `node-html-parser`.** Zero transitive deps, small, gives `querySelector` over real-world HTML. A hand-rolled extractor would be the single most fragile part of the pipeline and the fixtures could not cover the mess of live CMS markup.
- **Extra dev dependencies: `typescript`, `@types/node`.** Typecheck only; Node strips types at run time so there is no build output.
- **Candidates are selected before pages are fetched, then annotated.** Wrong-page detection needs titles and H1s, which need the fetch, which should only happen for the capped candidate list. So `find-candidates` ranks first, `fetch-page` runs on the top N, and `flagNewPages` is a second pass over `candidates.json`.
- **Claude writes `changes.json`, a script writes the ledger.** The proposed changes are only known after Claude writes the page files, and the ledger needs content hashes and positions from the run. A structured file plus `ledger.ts record` keeps the ledger deterministic and idempotent instead of asking Claude to edit JSON in place.
- **Page URL normalisation strips query strings, fragments and trailing slashes** before aggregation. Search Console reports them as separate pages; the owner edits one template.
- **`sites/` is gitignored in this repo only.** Users decide whether to commit their own workspace; the repo must never carry someone's Search Console data.
- **Config dir is `%APPDATA%\strike` on Windows and `$XDG_CONFIG_HOME/strike` or `~/.config/strike` elsewhere.** Standard locations, outside any project folder, so a stray `git add .` cannot pick up a token.
