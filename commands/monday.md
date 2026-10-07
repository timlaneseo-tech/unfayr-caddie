---
description: Write the weekly memo. Week-over-week Search Console (and GA4 when configured), the status of every edit Caddie suggested, the position moves on exactly those pages, and three things to do this week. Use --site <domain>, or --sample summitplumbing.example after a sample /find.
argument-hint: [--site domain | --sample summitplumbing.example] [--no-ga4]
allowed-tools: Bash(node *), Bash(npm *), Read, Write, Edit, Glob
---

# /monday

The script gathers the numbers and checks every page Caddie suggested an edit for. You write the memo. Nothing here calls the Anthropic API; you are the writer, inside this session.

## 1. Run the pipeline

If `${CLAUDE_PLUGIN_ROOT}/node_modules` does not exist, run `npm install --prefix "${CLAUDE_PLUGIN_ROOT}"` once. Then, from the user's working directory:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/monday.ts" $ARGUMENTS
```

The last line of stdout is the run folder, `sites/<domain>/runs/<date>/monday`. If the script fails, show its message and stop; it names the fix (run `setup.ts`, run `/find` first, or pass `--sample`).

## 2. Read the run

- `memo.json`: totals, every ledger change with its status and per-query positions, pages that moved on their own, GA4 if configured, and notes.
- `README.md` in the run folder: the same data as tables. The memo refers to it as "the tables".
- For the suggestions you will point at in "three things to do", the `/find` page file: `sites/<domain>/runs/<proposedOn>/find/<slug>.md`.

Load the skill `caddie:weekly-memo` with the Skill tool (or read `${CLAUDE_PLUGIN_ROOT}/skills/weekly-memo/SKILL.md` on a plain skills install).

## 3. Write the memo

Write `memo.md` in the run folder with exactly the sections the skill defines, then delete the `memo.md.pending` marker. Every number comes from the tables.

## 4. Finish

Tell the user, in a few lines: the week in one sentence, how many suggestions were applied and whether any moved, and the three things to do, each with its link. Point at `memo.md` as the file to forward.
