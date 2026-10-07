// Shared types for every script. Keep this file free of runtime code except the
// CHANGE_KINDS list, so that `import type` is all most callers need from it.

export interface SiteConfig {
  /** Exactly as Search Console returns it, e.g. "sc-domain:example.com" or "https://www.example.com/". */
  siteUrl: string;
  /** Folder name under sites/, e.g. "example.com" or "www.example.com". */
  domain: string;
  brandTerms: string[];
  /** BCP 47 tag used when phrasing questions for the AI check. */
  locale: string;
  /** Optional. Only /monday reads it. */
  ga4PropertyId?: string;
  thresholds: {
    positionMin: number;
    positionMax: number;
    minImpressions: number;
    maxPages: number;
    /** A query at position <= 2 with CTR above this is treated as brand. */
    brandCtr: number;
    queriesPerPageForAi: number;
  };
  ai: {
    model: string;
    /** Grounded Gemini calls allowed per calendar day across all sites on this machine. */
    dailyCap: number;
  };
}

export interface DateWindow {
  start: string;
  end: string;
}

export interface GscRow {
  query: string;
  page: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface QueryStat {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prior: { clicks: number; impressions: number; position: number } | null;
  brand: boolean;
  isQuestion: boolean;
  score: number;
}

export interface NewPageFlag {
  query: string;
  reason: string;
}

export interface PageCandidate {
  page: string;
  slug: string;
  score: number;
  impressions: number;
  clicks: number;
  /** Sorted by score, highest first. Brand queries are present but score 0. */
  queries: QueryStat[];
  newPage: NewPageFlag[];
}

export interface CandidatesFile {
  site: string;
  generatedAt: string;
  window: DateWindow;
  priorWindow: DateWindow;
  minImpressions: number;
  totalQueries: number;
  brandQueries: number;
  pages: PageCandidate[];
  skipped: string[];
}

export type ExtractStatus = 'ok' | 'thin' | 'failed';

export interface PageExtract {
  url: string;
  fetchedAt: string;
  status: ExtractStatus;
  httpStatus: number | null;
  error?: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1: string | null;
  headings: { level: number; text: string }[];
  paragraphs: string[];
  wordCount: number;
  jsonLd: unknown[];
  faq: { question: string; answer: string }[];
  contentHash: string | null;
}

export interface Citation {
  url: string;
  host: string;
  title: string | null;
}

export interface AiCheckResult {
  page: string;
  query: string;
  asked: string;
  model: string;
  answer: string;
  cited: Citation[];
  onSite: boolean;
  competitors: string[];
  error?: string;
}

export interface AiCheckFile {
  site: string;
  model: string;
  results: AiCheckResult[];
  skipped: number;
  skippedReason: string | null;
  usedToday: number;
  dailyCap: number;
}

export type ChangeKind = 'title' | 'meta' | 'h2' | 'answer' | 'faq' | 'faq-jsonld' | 'new-page';

export const CHANGE_KINDS: readonly ChangeKind[] = ['title', 'meta', 'h2', 'answer', 'faq', 'faq-jsonld', 'new-page'];

/** What Claude writes into changes.json after writing the page files. */
export interface ProposedChange {
  page: string;
  kind: ChangeKind;
  queries: string[];
  summary: string;
}

export interface LedgerEntry extends ProposedChange {
  id: string;
  date: string;
  /** Run directory relative to the site directory, e.g. "runs/2026-10-07/find". */
  run: string;
  contentHash: string | null;
  positionAtTime: number | null;
  impressionsAtTime: number;
  status: 'proposed';
}

export interface Ledger {
  site: string;
  entries: LedgerEntry[];
}
