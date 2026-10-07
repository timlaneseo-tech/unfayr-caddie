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
    /** Gemini calls allowed per calendar day across all sites on this machine. */
    dailyCap: number;
    /**
     * `auto` tries Google Search grounding and falls back to plain answers when the key's
     * tier does not allow it. `grounded` insists on citations; `plain` never asks for them.
     */
    mode: 'auto' | 'grounded' | 'plain';
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
  /** The answer text names the site or a brand term, whether or not it cites a URL. */
  mentionsSite: boolean;
  error?: string;
}

export interface AiCheckFile {
  site: string;
  model: string;
  /** `grounded` answers carry citations; `plain` answers do not (free tier). */
  mode: 'grounded' | 'plain';
  /** Why the run is in the mode it is, when that needs saying. */
  note: string | null;
  results: AiCheckResult[];
  skipped: number;
  skippedReason: string | null;
  usedToday: number;
  dailyCap: number;
}

export type ChangeKind = 'title' | 'meta' | 'h2' | 'answer' | 'faq' | 'faq-jsonld' | 'schema' | 'new-page';

/** `schema` covers structured data other than FAQ, such as LocalBusiness or Product JSON-LD. */
export const CHANGE_KINDS: readonly ChangeKind[] = ['title', 'meta', 'h2', 'answer', 'faq', 'faq-jsonld', 'schema', 'new-page'];

/** What Claude writes into changes.json after writing the page files. */
export interface ProposedChange {
  page: string;
  kind: ChangeKind;
  queries: string[];
  summary: string;
  /** Exact text whose presence on the page means the change was applied: the new title, H2, or first sentence. */
  lookFor?: string;
}

/**
 * `proposed` until /monday looks; then `applied` (the proposed text is on the page),
 * `changed` (the page changed but the text was not found), `unchanged`, `gone` (the
 * page no longer fetches) or `unknown` (fetch failed for another reason).
 */
export type ChangeStatus = 'proposed' | 'applied' | 'changed' | 'unchanged' | 'gone' | 'unknown';

export interface Observation {
  date: string;
  status: ChangeStatus;
  contentHash: string | null;
  /** This week's position for each of the entry's queries on its page, null when not seen. */
  positions: Record<string, number | null>;
}

export interface LedgerEntry extends ProposedChange {
  id: string;
  date: string;
  /** Run directory relative to the site directory, e.g. "runs/2026-10-07/find". */
  run: string;
  contentHash: string | null;
  /** Best position among the change's queries when proposed. */
  positionAtTime: number | null;
  /** Position of each query on the page when proposed. */
  queryPositions?: Record<string, number>;
  impressionsAtTime: number;
  status: ChangeStatus;
  /** First observation that saw the change applied, if any. */
  appliedOn?: string;
  observations?: Observation[];
}

export interface WeekTotals extends DateWindow {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface ChangeReport {
  id: string;
  page: string;
  kind: ChangeKind;
  summary: string;
  proposedOn: string;
  appliedOn: string | null;
  status: ChangeStatus;
  statusDetail: string;
  queries: { query: string; atProposal: number | null; lastWeek: number | null; thisWeek: number | null }[];
}

export interface PageMove {
  page: string;
  impressions: number;
  positionLast: number;
  positionThis: number;
  delta: number;
  topQuery: string;
}

export interface Ga4PageRow {
  path: string;
  sessionsThis: number;
  sessionsLast: number;
  engagedThis: number;
  engagedLast: number;
  keyEventsThis: number;
  keyEventsLast: number;
}

export interface MemoJson {
  site: string;
  date: string;
  thisWeek: WeekTotals;
  lastWeek: WeekTotals;
  changes: ChangeReport[];
  moversUp: PageMove[];
  moversDown: PageMove[];
  ga4: { propertyId: string; pages: Ga4PageRow[] } | null;
  notes: string[];
}

export interface Ledger {
  site: string;
  entries: LedgerEntry[];
}
