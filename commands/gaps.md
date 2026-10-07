---
description: Find the questions in your market that AI assistants answer without you and the site does not answer, and write a brief for each with the first paragraph done. Use --site <domain>, or --sample summitplumbing.example.
argument-hint: [--site domain | --sample summitplumbing.example] [--no-ai]
allowed-tools: Bash(node *), Bash(npm *), Read, Write, Edit, Glob
---

# /gaps

The script collects the questions, what the site has for them, and what Gemini answers. You judge which are real gaps and write the briefs. Nothing here calls the Anthropic API; you are the writer, inside this session.

## 1. Run the pipeline

If `${CLAUDE_PLUGIN_ROOT}/node_modules` does not exist, run `npm install --prefix "${CLAUDE_PLUGIN_ROOT}"` once. Then, from the user's working directory:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/gaps.ts" $ARGUMENTS
```

The last line of stdout is the run folder, `sites/<domain>/runs/<date>/gaps`. If the script says there is no `market` block in `config.json`, tell the user what to add (five or six topic phrases, competitor domains, one line on the audience; see `${CLAUDE_PLUGIN_ROOT}/docs/gaps.md`) and continue with the Search Console questions it found.

## 2. Read the run

- `gaps.json`: open questions ranked, each with its signals; `covered` for the ones the site handles.
- `ai-check.json`: Gemini's answer per question, grounded or plain.
- `pages/*.json` here and in the latest `/find` run: what the site already says.
- `README.md`: the ranked table with a `_pending_` cell per brief.

Load `caddie:gap-brief` with the Skill tool (it leans on `caddie:answer-first-copy` and `caddie:page-diff`), or read the SKILL.md files on a plain skills install.

## 3. Write the briefs

For each gap the README marks for a brief, write `<slug>.md` as gap-brief defines, skipping and replacing as the skill says. Then write `changes.json`, replace each `_pending_` cell in `README.md` with the one-line deliverable, and record the ledger:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.ts" record --site <domain> --run <run folder>
```

## 4. Finish

Tell the user, in a few lines: how many questions were checked and how many are open, the top three briefs with their working titles, and what was skipped (no market block, AI check without a key). Point them at the README table as the place to start.
