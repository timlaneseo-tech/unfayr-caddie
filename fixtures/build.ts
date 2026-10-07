#!/usr/bin/env node
/**
 * Turn each fixture seed into 56 days of Search Console rows.
 *
 *   node fixtures/build.ts
 *
 * Rows carry a `day` index (0 = oldest day of the prior window, 55 = last day of
 * the current window) instead of a date, so sample mode can place them on real
 * dates whenever it runs. Everything is seeded per query, so adding a query does
 * not reshuffle the others, and the committed output is reproducible.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ctrAt } from '../scripts/lib/ctr.ts';
import { encodeFixtureRows, type FixtureRow } from '../scripts/lib/fixtures.ts';

export interface SeedPage {
  url: string;
  title: string;
  h1: string;
}

export interface Seed {
  domain: string;
  siteUrl: string;
  brandTerms: string[];
  locale: string;
  weekendFactor: number;
  pages: Record<string, SeedPage>;
  expand?: {
    areas: string[];
    templates: { pattern: string; services: [string, string][] }[];
  };
  /** [query, pageKey, position, impressions28, flags?] with flags among brand, up, down. */
  queries: [string, string, number, number, string?][];
}

export const FIXTURE_DAYS = 56;

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function poisson(rand: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + gaussian(rand) * Math.sqrt(lambda)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

export function expandQueries(seed: Seed): Seed['queries'] {
  const out = [...seed.queries];
  const seen = new Set(out.map((q) => q[0]));
  if (!seed.expand) return out;
  for (const t of seed.expand.templates) {
    for (const [service, pageKey] of t.services) {
      for (const area of seed.expand.areas) {
        const q = t.pattern.replace('{service}', service).replace('{area}', area).replace(/\s+/g, ' ').trim();
        if (seen.has(q)) continue;
        seen.add(q);
        const rand = mulberry32(hash32(q));
        const position = Math.round((3 + rand() * 15) * 10) / 10;
        const impressions = Math.round(6 + rand() * 80);
        out.push([q, pageKey, position, impressions]);
      }
    }
  }
  return out;
}

export function buildRows(seed: Seed): FixtureRow[] {
  const rows: FixtureRow[] = [];
  for (const [query, pageKey, basePosition, impressions28, flagStr] of expandQueries(seed)) {
    const page = seed.pages[pageKey];
    if (!page) throw new Error(`Query "${query}" points at unknown page key "${pageKey}"`);
    const flags = new Set((flagStr ?? '').split(',').map((f) => f.trim()).filter(Boolean));
    const rand = mulberry32(hash32(query));
    const brand = flags.has('brand');
    // Where the query sat in the prior window relative to now.
    const priorShift = flags.has('up') ? 2.5 + rand() * 1.5 : flags.has('down') ? -(1.5 + rand() * 1.5) : gaussian(rand) * 0.4;
    const brandCtr = 0.45 + rand() * 0.25;
    const ctrNoise = Math.exp(gaussian(rand) * 0.25);
    const mean = impressions28 / 28;

    for (let day = 0; day < FIXTURE_DAYS; day++) {
      const inPrior = day < 28;
      const weekend = day % 7 >= 5;
      const lambda = mean * (weekend ? seed.weekendFactor : 1) * (inPrior ? 0.92 + rand() * 0.16 : 1);
      const impressions = poisson(rand, lambda);
      if (impressions === 0) continue;
      let position = basePosition + (inPrior ? priorShift : 0) + gaussian(rand) * 0.8;
      position = Math.max(1, Math.round(position * 10) / 10);
      const ctr = brand ? brandCtr : Math.min(0.9, ctrAt(position) * ctrNoise * Math.exp(gaussian(rand) * 0.3));
      let clicks = 0;
      for (let i = 0; i < impressions; i++) if (rand() < ctr) clicks++;
      rows.push({ query, page: page.url, day, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });
    }
  }
  return rows;
}

export function loadSeed(dir: string): Seed {
  return JSON.parse(readFileSync(join(dir, 'seed.json'), 'utf8')) as Seed;
}

const here = fileURLToPath(new URL('.', import.meta.url));

if (process.argv[1] && fileURLToPath(new URL(import.meta.url)) === process.argv[1]) {
  for (const name of readdirSync(here)) {
    const dir = join(here, name);
    if (!statSync(dir).isDirectory()) continue;
    const seed = loadSeed(dir);
    const rows = buildRows(seed);
    writeFileSync(join(dir, 'gsc-rows.json'), JSON.stringify(encodeFixtureRows(rows)));
    const queries = new Set(rows.map((r) => r.query)).size;
    console.log(`${name}: ${queries} queries, ${rows.length} daily rows`);
  }
}
