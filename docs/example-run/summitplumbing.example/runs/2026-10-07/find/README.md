# /find run: sc-domain:summitplumbing.example, 2026-10-07

Window 2026-09-07 to 2026-10-04, compared with 2026-08-10 to 2026-09-06.
286 queries seen, 11 of them brand. 10 pages worth editing, ranked below by the clicks they would gain at position 3.

| # | Page | Clicks to gain | Top query | Pos. | Impr. | AI answers | Page | What to do |
|--:|------|---------------:|-----------|-----:|------:|------------|------|------------|
| 1 | [water-heater-repair](water-heater-repair.md) | 362 | water heater repair | 13.7 | 4,040 | 0/3 cite you, 2 cite only competitors | ok | Retitle with Boise, add a "No hot water? Check these three things first" section and lead the cost section with the $150 to $600 range |
| 2 | [plumbing-cost-guide](plumbing-cost-guide.md) | 307 | how much does a plumber cost | 11.6 | 2,564 | 0/3 cite you, 3 cite only competitors | ok | Open with the $125 to $175 hourly answer, add a water heater replacement cost section and a five-question price FAQ |
| 3 | [emergency-plumber](emergency-plumber.md) | 281 | emergency plumber near me | 10.5 | 3,177 | 0/3 cite you, 3 cite only competitors | ok | Put Boise in the title, turn "Stop the Water First" into the shut-off question and add a frozen-pipes section |
| 4 | [drain-cleaning](drain-cleaning.md) | 260 | drain cleaning near me | 9.7 | 1,838 | 0/3 cite you, 3 cite only competitors | ok, 1 new-page | Add the city and symptoms to the title, add a "Why does my toilet keep clogging?" section; write a separate Drano post |
| 5 | [blog-how-long-do-water-heaters-last](blog-how-long-do-water-heaters-last.md) | 251 | water heater replacement cost | 14.1 | 2,431 | 1/3 cite you, 2 cite only competitors | ok | Move the 8-to-12-year answer into the opening paragraph and add the replacement cost section the page is ranking for |
| 6 | [blog-why-is-my-water-heater-leaking](blog-why-is-my-water-heater-leaking.md) | 222 | hot water heater leaking | 11.4 | 2,183 | 0/3 cite you, 3 cite only competitors | ok | Retitle to the why question, give the bottom leak its own heading with the answer first, add a four-question FAQ |
| 7 | [index](index.md) | 196 | plumber near me | 14.5 | 3,889 | none asked | ok | Lead the title with "Plumber in Boise" and rename two headings around the review count and the towns served |
| 8 | [tankless-water-heaters](tankless-water-heaters.md) | 187 | tankless water heater installation cost | 6.3 | 1,932 | none asked | ok | Bring the $3,500 to $6,500 answer up from the FAQ accordion, rename two headings to the vs and sizing questions, add FAQ JSON-LD |
| 9 | [sump-pump-repair](sump-pump-repair.md) | 134 | sump pump installation | 14.3 | 1,269 | none asked | ok | Add installation to the title, turn the problems paragraph into the running-constantly question and add a three-question FAQ |
| 10 | [about](about.md) | 4 | plumber reviews boise | 13.2 | 191 | none asked | thin | Retitle as family-owned Boise plumber and add a reviews section; low value, do it last |

Clicks to gain is impressions times the CTR gap between the current position and position 3, summed over the page's qualifying queries, for 28 days.

## Skipped

- 11 brand queries kept in tables but not scored
- 5 queries under 20 impressions in 28 days
- 33 queries outside positions 4-15
- https://summitplumbing.example/about returned very little text (119 words); if it renders with JavaScript, the diagnosis is based on the queries only.

## Run again

Search Console data for the same date range is cached, so re-running today is instant. Tomorrow pulls fresh data.

```
node scripts/find.ts --sample summitplumbing.example
```

Every change proposed in these files is recorded in `ledger.json` with the page's content hash, so a later `/monday` can report what changed and what moved.

Built by Unfayr · unfayr.com
