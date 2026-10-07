---
description: Coming soon. Will write a weekly memo with week-over-week Search Console and GA4, the status of every edit Caddie suggested, the moves on exactly those pages, and three things to do this week.
argument-hint: [--site domain]
---

# /monday is not built yet

Tell the user, in a few lines:

- `/monday` is designed but not built. The design is in `${CLAUDE_PLUGIN_ROOT}/docs/monday.md`: a one-file memo that reads `sites/<domain>/ledger.json`, re-fetches every page Caddie suggested an edit for, compares the content hash to tell whether the edit was made, pulls the positions of exactly the queries each edit served, adds GA4 landing-page numbers when `ga4PropertyId` is set, and ends with three things to do this week.
- The memory it depends on is already being written: every `/find` run records each proposed change in the ledger with the page's content hash and the positions at the time. If the user has run `/find`, show them the ledger with:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/ledger.ts" list --site <domain>
```

- Until `/monday` exists, the Verify section at the end of each `/find` page file says which queries to watch and when.

Do not attempt to run the `/monday` pipeline; there are no scripts for it yet.
