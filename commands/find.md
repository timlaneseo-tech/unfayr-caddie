---
description: Turn Search Console striking-distance queries (positions 4 to 15) into paste-ready page edits with evidence and a verification line. Use with --site <domain> for your site or --sample summitplumbing.example to try it on fixture data.
argument-hint: [--site domain | --sample summitplumbing.example] [--no-ai]
allowed-tools: Bash(node *), Bash(npm *), Read, Write, Edit, Glob
---

# /find

Scripts do the deterministic work and write JSON into a run folder. You read that folder and write the page files. Nothing here calls the Anthropic API; you are the writer, inside this session.

## 1. Run the pipeline

Check Node is 22.18 or newer, and that the plugin's dependencies are installed:

```
node --version
```

If `${CLAUDE_PLUGIN_ROOT}/node_modules` does not exist, run `npm install --prefix "${CLAUDE_PLUGIN_ROOT}"` once.

Then, from the user's working directory:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/find.ts" $ARGUMENTS
```

The last line of stdout is the run folder, `sites/<domain>/runs/<date>/find`. If the script fails, show its message and stop: it names the fix (run `setup.ts`, run `sites.ts`, or pass `--sample`).

## 2. Read the run

Read, in this order:

- `candidates.json`: ranked pages, each with its queries.
- `ai-check.json`: grounded AI answers for the top queries, or a `skippedReason`.
- `pages/<slug>.json` for each page, as you reach it.

Load the three skills before writing. Use the Skill tool with `caddie:intent-match`, `caddie:answer-first-copy` and `caddie:page-diff`; if the Skill tool does not list them (plain skills install), read `${CLAUDE_PLUGIN_ROOT}/skills/<name>/SKILL.md` instead.

## 3. Write one file per page

Work down `candidates.json` in rank order. For each page, write `<slug>.md` in the run folder with exactly the sections page-diff defines: Queries, Why it sits here, Fixes, New page (only if earned), Verify, credit line. Diagnose with intent-match; write the copy with answer-first-copy.

Do every page in the file, including thin and failed ones. If the run has more than ten pages, write them in batches and keep going; do not summarise the tail.

## 4. Record and finish

- Write `changes.json` in the run folder as page-diff specifies.
- Edit `README.md` in the run folder: replace each `_pending_` cell with the one-line fix for that page.
- Lint. The first run corrects the character counts you claimed in Why lines; then fix every remaining error (shorten what is too long, do not relabel it) and run it again clean:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-page.ts" --run <run folder> --fix-counts
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-page.ts" --run <run folder>
```

- Record the ledger. The domain is the folder name under `sites/`:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.ts" record --site <domain> --run <run folder>
```

Then tell the user, in a few lines: where the run folder is, the top three pages with their one-line fix, and anything that was skipped (AI check without a key, failed fetches). Point them at the README table as the place to start.
