---
name: caddie-run
description: Use when someone asks to run their site through Caddie, the whole Caddie process, or an SEO check with Caddie, e.g. "run my site example.com through the entire caddie process", "caddie my site", "run caddie on example.com", "do the full caddie thing for my website". Sets up Google Cloud and Search Console the first time, learns the business, runs /find, /gaps and /monday, and opens one short report.
---

# Running the whole Caddie process

This is the same job as the `/caddie` command. Read the command file and follow it exactly, with the site the person named as the argument:

- As a plugin: `${CLAUDE_PLUGIN_ROOT}/commands/caddie.md`
- On a plain skills install: `commands/caddie.md` two folders up from this skill

If they did not name a site, ask for it in one short line ("Which site? The address is enough, like example.com.") before anything else. If they only want to see what Caddie does, use `--sample summitplumbing.example`.
