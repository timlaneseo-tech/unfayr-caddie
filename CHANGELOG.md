# Changelog

## 0.3.0 (2026-10-09)

**Just ask.** Open Claude Code and say "Run my site example.com through the entire Caddie process" (or `/caddie example.com`). Caddie sets up whatever is missing, runs everything and opens one short report.

**New**
- `/caddie` and the `caddie-run` skill: the whole process from one sentence. First time, a guided Google Cloud setup, one step at a time, with each console page opened for you. Returning users go straight to the runs.
- **The Caddie Report**: about ten pages, opens at the end. Your top five moves on page one, the top fixes with before-and-after text, every other page as a checklist, problems that repeat across the whole site, the new pages to write with their first paragraphs, and what Caddie checked. Clickable contents and PDF bookmarks.
- **The Implementation Pack**: the full per-page scorecard (the old `report.pdf`), renamed and kept for whoever makes the edits.
- **Business card**: Caddie drafts your brand terms, locations, offerings, competitors and customer topics from your own site and asks one question: is anything on the site out of date?
- `doctor.ts` reports what is set up and the next step. `sites.ts --url` matches what you typed to your Search Console property. `setup.ts` gains `--install-client` (finds the downloaded OAuth file), `--gemini-key`/`--gemini-skip` (key stored in Caddie's settings folder), `--ga4-from-site` (finds GA4 from the site, including through Tag Manager) and `--open-url`.
- Results default to `Documents/Caddie` (`CADDIE_HOME` overrides).

**Fixed**
- PDFs could be missing for a few seconds, or never written, when Chrome was already open. Printing now uses its own temporary browser profile.

## 0.2.0 (2026-10-09)

The first version tested end to end on a live site (a multi-location equipment dealer on a Dealer Spike CMS behind Cloudflare). Everything here came out of that run.

**New**
- The `/find` report opens itself when the run finishes: the PDF in your default viewer, or the HTML when no Chrome or Edge is installed to print it. Set `CADDIE_NO_OPEN=1` to stop that for scheduled runs.
- `config.json` takes a `notes` array for facts your pages cannot show: a location you sold, a service you dropped, a brand you no longer carry. `/find` reads it first and will propose retiring a page instead of building it out.
- A `redirect` change kind for retiring a page; `/monday` counts it applied once the page returns 404 or 410, or canonicalises elsewhere.
- `node scripts/ledger.ts rehash --site <domain>` recomputes the ledger's page fingerprints from the saved snapshots. Run it once after upgrading from 0.1.0 (see below).

**Fixed**
- Sites behind Cloudflare that refused Caddie's page fetches with HTTP 403 are now read: a 403 is retried once with the system `curl`, same user agent, same single request per page.
- `/monday` no longer reports a page as changed because its featured-inventory cards rotated between loads.
- `/gaps` edits to pages that `/gaps` did not fetch are now compared against the latest `/find` snapshot, instead of reading as changed on day one. A change with no snapshot at all reads as unknown, not changed.
- `/gaps` template questions read naturally for plural topics ("How much do compact track loaders cost?") and skip topics that make no sense as questions.
- The quickstart's `cd` matches the folder `git clone` creates.

**Upgrading from 0.1.0**
Pull, then for each site you already run: `node scripts/ledger.ts rehash --site <domain>`. Without it, pages with inventory or related-post cards may read as changed in the next memo.

## 0.1.0 (2026-10-07)

First release: `/find`, `/gaps` and `/monday`, the branded scorecard report (HTML and PDF), sample mode on two fixture sites, the Gemini answer check (plain on the free tier, grounded with billing), and the ledger that lets `/monday` remember what it suggested.
