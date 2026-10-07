---
description: Coming soon. Will find the questions in your market that AI assistants answer weakly, uncited, or citing only competitors, and draft the answer pages.
argument-hint: [--site domain]
---

# /gaps is not built yet

Tell the user, in a few lines:

- `/gaps` is designed but not built. The design is in `${CLAUDE_PLUGIN_ROOT}/docs/gaps.md`: it will take question-form queries from Search Console plus the user's own list, ask Gemini (with grounding) and Claude each one, score where the answers are weak, uncited or competitor-only, and write one draft answer page per gap in the same before/after form as `/find`.
- `/find` already does part of this today: its AI answer check asks Gemini the top three questions per candidate page and records who was cited, and each page file says when a competitor's definition is being quoted where this site's could be. Suggest running `/find` now.
- Everything `/gaps` will need is already being collected: the Search Console pulls under `sites/<domain>/data/` and the ledger under `sites/<domain>/ledger.json`.

Do not attempt to run the `/gaps` pipeline; there are no scripts for it yet.
