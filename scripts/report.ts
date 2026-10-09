#!/usr/bin/env node
/**
 * Two reports, as HTML and, when Chrome or Edge is installed, PDF (Edge ships with Windows;
 * Chrome is found on macOS and Linux paths). No service is involved; the browser prints
 * the HTML it is given.
 *
 *   node scripts/report.ts --report --site example.com [--date 2026-10-09] [--pdf] [--open]
 *     The Caddie Report: the owner's read, about ten pages, from that date's /find, /gaps
 *     and /monday runs. Written to runs/<date>/Caddie Report - <host> - <date>.pdf.
 *   node scripts/report.ts --run sites/example.com/runs/2026-10-07/find [--pdf] [--screenshot] [--open]
 *     The Implementation Pack: every page with every paste-ready edit, for whoever makes
 *     them. Pages whose markdown has not been written yet are listed as not yet written.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { parseArgs, flagBool, flagString } from './lib/args.ts';
import { CREDIT } from './lib/readme.ts';
import type { AiCheckFile, CandidatesFile } from './lib/types.ts';
import { siteHost } from './lib/config.ts';
import { renderCaddieReport } from './lib/caddie-report.ts';
import { siteDir, todayIso } from './lib/paths.ts';
import { loadReportData } from './lib/report-data.ts';

const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url));

marked.setOptions({ gfm: true, breaks: false });

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Markdown page files use fenced blocks for Before/After; mark them so the stylesheet can tell them apart. */
function renderPageMarkdown(md: string): string {
  // Drop the H1 and the url/rank lines; the report renders its own hole header.
  const body = md.replace(/^# .*\n+/m, '').replace(/^https?:\/\/\S+\n.*\n/m, '').replace(/\n+Built by Unfayr · unfayr\.com\s*$/, '');
  let html = marked.parse(body) as string;
  // "Before:" / "After:" paragraphs directly precede a <pre>; tag the pre with the label.
  html = html.replace(/<p>(Before|After)(?: \(([^)]*)\))?:<\/p>\s*<pre><code[^>]*>/g, (_m, label: string) => `<pre class="diff ${label.toLowerCase()}" data-label="${label}"><code>`);
  return html;
}

export interface ReportInput {
  run: string;
  candidates: CandidatesFile;
  ai: AiCheckFile | null;
  readme: string;
  pages: { slug: string; title: string; md: string | null }[];
  date: string;
}

export function loadRun(run: string): ReportInput {
  const candidates = JSON.parse(readFileSync(join(run, 'candidates.json'), 'utf8')) as CandidatesFile;
  const aiFile = join(run, 'ai-check.json');
  const ai = existsSync(aiFile) ? (JSON.parse(readFileSync(aiFile, 'utf8')) as AiCheckFile) : null;
  const readme = existsSync(join(run, 'README.md')) ? readFileSync(join(run, 'README.md'), 'utf8') : '';
  const date = /runs[\\/](\d{4}-\d{2}-\d{2})/.exec(run + '/')?.[1] ?? candidates.generatedAt.slice(0, 10);
  const pages = candidates.pages.map((p) => {
    const f = join(run, `${p.slug}.md`);
    const md = existsSync(f) ? readFileSync(f, 'utf8') : null;
    const title = md ? (/^# (.+)$/m.exec(md)?.[1] ?? p.slug) : p.slug;
    return { slug: p.slug, title, md };
  });
  return { run, candidates, ai, readme, pages, date };
}

function whatToDo(readme: string, slug: string): string | null {
  const line = readme.split('\n').find((l) => l.includes(`[${slug}](${slug}.md)`));
  if (!line) return null;
  const cells = line.split('|').map((c) => c.trim());
  const cell = cells[cells.length - 2] ?? '';
  return cell && cell !== '_pending_' ? cell : null;
}

function aiCell(page: string, ai: AiCheckFile | null): string {
  if (!ai) return '';
  const rs = ai.results.filter((r) => r.page === page && !r.error);
  if (!rs.length) return '';
  if (ai.mode === 'plain') return `${rs.filter((r) => r.mentionsSite).length} of ${rs.length} mention you`;
  const you = rs.filter((r) => r.onSite).length;
  const comp = rs.filter((r) => !r.onSite && r.competitors.length).length;
  return `${you} of ${rs.length} cite you${comp ? `, ${comp} cite competitors` : ''}`;
}

export function renderReport(input: ReportInput): string {
  const { candidates: c, ai, readme, pages, date } = input;
  const host = siteHost(c.site);
  const lockup = existsSync(join(ASSETS, 'caddie-lockup-on-light.svg')) ? readFileSync(join(ASSETS, 'caddie-lockup-on-light.svg'), 'utf8') : '';
  const mark = existsSync(join(ASSETS, 'caddie-mark.svg')) ? readFileSync(join(ASSETS, 'caddie-mark.svg'), 'utf8') : '';
  const totalGain = c.pages.reduce((s, p) => s + p.score, 0);
  const written = pages.filter((p) => p.md).length;
  const brandShare = c.totalQueries ? Math.round((c.brandQueries / c.totalQueries) * 100) : 0;

  const rows = c.pages
    .map((p, i) => {
      const top = p.queries.find((q) => !q.brand) ?? p.queries[0];
      const todo = whatToDo(readme, p.slug);
      const written = pages[i].md !== null;
      return `<tr${written ? '' : ' class="unwritten"'}>
        <td class="num">${i + 1}</td>
        <td class="page">${written ? `<a href="#hole-${i + 1}">${esc(pages[i].title)}</a>` : esc(pages[i].title)}<span class="url">${esc(p.page.replace(/^https?:\/\//, ''))}</span></td>
        <td class="num">${fmt(p.score)}</td>
        <td class="query">${esc(top.query)}<span class="meta">position ${top.position.toFixed(1)}, ${fmt(top.impressions)} impressions</span></td>
        <td class="todo">${todo ? esc(todo) : written ? '' : '<span class="muted">Not written yet. Run /find to finish this page.</span>'}${aiCell(p.page, ai) ? `<span class="meta">${esc(aiCell(p.page, ai))}</span>` : ''}</td>
      </tr>`;
    })
    .join('\n');

  const skipped = [...c.skipped];
  if (ai?.note) skipped.push(ai.note);
  if (ai?.skippedReason) skipped.push(ai.skippedReason);

  const holes = pages
    .map((p, i) => {
      if (!p.md) return '';
      const cand = c.pages[i];
      return `<section class="hole" id="hole-${i + 1}">
        <header class="hole-head">
          <div class="hole-num">${i + 1}</div>
          <div>
            <h2>${esc(p.title)}</h2>
            <p class="hole-meta"><span class="url">${esc(cand.page.replace(/^https?:\/\//, ''))}</span> ${fmt(cand.score)} clicks a month to gain at position 3.</p>
          </div>
        </header>
        <div class="hole-body">${renderPageMarkdown(p.md)}</div>
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Caddie report for ${esc(host)}, ${esc(date)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --ultra: #1E1BF5;
    --ink: #000000;
    --paper: #FFFFFF;
    --fog: #ECECF2;
    --slate: #5B5B66;
    --turf: #1B6B3A;
    --sans: "Space Grotesk", "Helvetica Neue", Arial, sans-serif;
    --mono: "IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }
  * { box-sizing: border-box; }
  html { font-size: 16px; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  a { color: inherit; text-decoration: none; }
  a:hover, a:focus-visible { text-decoration: underline; text-decoration-color: var(--ultra); text-underline-offset: 3px; }
  :focus-visible { outline: 2px solid var(--ultra); outline-offset: 2px; }
  .sheet { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }

  .cover { display: grid; gap: 1.5rem; }
  .brand { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .brand svg { height: 2.5rem; width: auto; display: block; }
  .site { text-align: right; font-size: 0.95rem; color: var(--slate); line-height: 1.35; }
  .site strong { color: var(--ink); font-weight: 500; display: block; }
  h1 { font-size: clamp(1.9rem, 4.6vw, 2.75rem); line-height: 1.08; letter-spacing: -0.015em; font-weight: 700; margin: 0.5rem 0 0; max-width: 20ch; }
  h1 em { font-style: normal; }
  .rule { height: 3px; background: var(--ultra); width: 5.5rem; border-radius: 2px; }
  .lede { font-size: 1.05rem; max-width: 62ch; margin: 0; }
  .lede + .lede { margin-top: 0.75rem; }

  .scorecard { width: 100%; border-collapse: collapse; margin-top: 2rem; font-size: 0.92rem; }
  .scorecard th { text-align: left; font-weight: 500; color: var(--slate); border-bottom: 1px solid var(--ink); padding: 0 0.5rem 0.4rem 0; vertical-align: bottom; }
  .scorecard th.num, .scorecard td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .scorecard td { vertical-align: top; padding: 0.6rem 0.5rem 0.6rem 0; border-bottom: 1px solid var(--fog); }
  .scorecard td.num:first-child { color: var(--ultra); font-weight: 700; font-size: 1.05rem; padding-right: 0.75rem; }
  .scorecard td.page a { font-weight: 500; }
  .scorecard .url, .scorecard .meta { display: block; color: var(--slate); font-size: 0.78rem; font-family: var(--mono); margin-top: 0.15rem; }
  .scorecard .url { word-break: break-all; }
  .scorecard .meta { font-family: var(--sans); }
  .scorecard th.num { white-space: nowrap; }
  .scorecard td.query { font-family: var(--mono); font-size: 0.85rem; }
  .scorecard tr.unwritten td { color: var(--slate); }
  .muted { color: var(--slate); }
  .legend { color: var(--slate); font-size: 0.85rem; margin-top: 0.75rem; max-width: 62ch; }
  .skipped { margin-top: 1.75rem; }
  .skipped h3, .hole-body h2, .hole-body h3 { font-weight: 700; letter-spacing: -0.005em; }
  .skipped h3 { font-size: 1rem; margin: 0 0 0.5rem; }
  .skipped ul { margin: 0; padding-left: 1.1rem; color: var(--slate); font-size: 0.9rem; }
  .skipped li + li { margin-top: 0.3rem; }

  .hole { margin-top: 3.5rem; padding-top: 2rem; border-top: 1px solid var(--ink); }
  .hole-head { display: grid; grid-template-columns: 3.25rem 1fr; gap: 1rem; align-items: start; }
  .hole-num { font-size: 2.4rem; font-weight: 700; line-height: 1; color: var(--ultra); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .hole h2 { font-size: 1.45rem; line-height: 1.2; margin: 0.15rem 0 0.35rem; letter-spacing: -0.01em; }
  .hole-meta { margin: 0; color: var(--slate); font-size: 0.9rem; }
  .hole-meta .url { font-family: var(--mono); font-size: 0.8rem; display: block; word-break: break-all; }
  .hole-body { max-width: 62ch; }
  .hole-body h2 { font-size: 1.1rem; margin: 2rem 0 0.6rem; }
  .hole-body h3 { font-size: 1rem; margin: 1.6rem 0 0.5rem; }
  .hole-body p { margin: 0.6rem 0; }
  .hole-body table { width: 100%; border-collapse: collapse; font-family: var(--mono); font-size: 0.78rem; margin: 0.75rem 0 1rem; max-width: none; }
  .hole-body th { text-align: left; font-weight: 500; color: var(--slate); border-bottom: 1px solid var(--ink); padding: 0.25rem 0.5rem 0.35rem 0; }
  .hole-body td { padding: 0.3rem 0.5rem 0.3rem 0; border-bottom: 1px solid var(--fog); vertical-align: top; }
  .hole-body th:not(:first-child), .hole-body td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .hole-body pre { font-family: var(--mono); font-size: 0.82rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; margin: 0.5rem 0 0.9rem; padding: 0.85rem 1rem; background: var(--fog); border-radius: 4px; position: relative; }
  .hole-body pre code { font-family: inherit; }
  .hole-body pre.diff { padding-top: 1.9rem; }
  .hole-body pre.diff::before { content: attr(data-label); position: absolute; top: 0.55rem; left: 1rem; font-family: var(--sans); font-size: 0.72rem; font-weight: 500; color: var(--slate); }
  .hole-body pre.after { background: var(--paper); border: 1.5px solid var(--ultra); }
  .hole-body pre.after::before { color: var(--ultra); }
  .hole-body ul, .hole-body ol { padding-left: 1.2rem; }
  .hole-body li { margin: 0.25rem 0; }
  .hole-body blockquote { margin: 0.75rem 0; padding-left: 1rem; border-left: 2px solid var(--fog); color: var(--slate); }
  .hole-body code:not(pre code) { font-family: var(--mono); font-size: 0.85em; background: var(--fog); padding: 0.05em 0.3em; border-radius: 3px; }

  .verify { color: var(--turf); }
  footer.credit { margin-top: 4rem; padding-top: 1rem; border-top: 1px solid var(--fog); display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; color: var(--slate); font-size: 0.85rem; }
  footer.credit svg { height: 1.4rem; width: auto; }

  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
  @media print {
    @page { size: Letter; margin: 16mm 16mm 18mm; }
    html { font-size: 11pt; }
    .sheet { max-width: none; padding: 0; }
    .hole { break-before: page; border-top: 0; margin-top: 0; padding-top: 0; }
    .hole-body pre, .hole-body table, .hole-head { break-inside: avoid; }
    .scorecard tr { break-inside: avoid; }
    .scorecard thead { display: table-header-group; }
    a { color: inherit; }
    footer.credit { break-before: avoid; }
  }
</style>
</head>
<body>
<main class="sheet">
  <section class="cover">
    <div class="brand">
      ${lockup}
      <div class="site"><strong>${esc(host)}</strong>${esc(longDate(date))}</div>
    </div>
    <h1>Caddie read <em>${fmt(c.totalQueries)}</em> queries and found <em>${c.pages.length}</em> pages within reach of page one.</h1>
    <div class="rule"></div>
    <p class="lede">These pages already rank between positions ${c.pages.length ? Math.min(...c.pages.flatMap((p) => p.queries.filter((q) => !q.brand).map((q) => q.position))).toFixed(0) : 4} and 15 for queries people type every month. Moving them to position 3 would be worth about <strong>${fmt(totalGain)} extra clicks a month</strong>, by the published click-through curve. Each page below has its edits written out, ready to paste.</p>
    <p class="lede">Data: Google Search Console, ${esc(c.window.start)} to ${esc(c.window.end)}, compared with ${esc(c.priorWindow.start)} to ${esc(c.priorWindow.end)}. ${brandShare}% of the site's queries are brand searches and were left alone. ${written} of ${c.pages.length} page files are written.</p>

    <table class="scorecard">
      <thead><tr><th class="num">#</th><th>Page</th><th class="num">Clicks to gain</th><th>Top query</th><th>What to do</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="legend">Clicks to gain is impressions times the click-through gap between the current position and position 3, summed over each page's qualifying queries, per 28 days. It ranks the work; it is not a forecast.</p>
    ${skipped.length ? `<div class="skipped"><h3>Left out of this run</h3><ul>${skipped.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
  </section>

  ${holes}

  <footer class="credit">
    <span>${esc(CREDIT)}</span>
    ${mark}
  </footer>
</main>
</body>
</html>
`;
}

const BROWSER_CANDIDATES: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium'],
};

export function findBrowser(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  if (env.CADDIE_BROWSER && existsSync(env.CADDIE_BROWSER)) return env.CADDIE_BROWSER;
  for (const p of BROWSER_CANDIDATES[platform] ?? []) if (p && existsSync(p)) return p;
  return null;
}

/**
 * With the owner's own Chrome already open, a headless call can hand the job to that
 * process and return before the PDF exists. A throwaway profile makes it a separate
 * process that finishes before returning; the short wait covers anything slower.
 */
export function printToPdf(browser: string, htmlPath: string, pdfPath: string): void {
  const profile = mkdtempSync(join(tmpdir(), 'caddie-chrome-'));
  try {
    rmSync(pdfPath, { force: true });
    execFileSync(
      browser,
      ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--run-all-compositor-stages-before-draw', '--virtual-time-budget=4000', '--no-pdf-header-footer', '--generate-pdf-document-outline', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href],
      { stdio: 'ignore', timeout: 90_000 },
    );
    const until = Date.now() + 30_000;
    while (!existsSync(pdfPath) && Date.now() < until) execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},250)']);
    if (!existsSync(pdfPath)) throw new Error(`The browser did not write ${pdfPath}. Open the .html file and use Print, Save as PDF.`);
  } finally {
    // Chrome's crash handler can hold the profile for a moment on Windows; a leftover temp
    // folder is harmless, a cleanup error that fails a finished report is not.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // left for the OS temp cleaner
    }
  }
}

export function screenshot(browser: string, htmlPath: string, pngPath: string, width = 1100, height = 1500): void {
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, '--virtual-time-budget=4000', `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href], { stdio: 'ignore', timeout: 90_000 });
}

/** The command that hands a file to the desktop's default app for its type. */
export function openCommand(file: string, platform: NodeJS.Platform = process.platform): [string, string[]] {
  if (platform === 'win32') return ['explorer.exe', [file]];
  if (platform === 'darwin') return ['open', [file]];
  return ['xdg-open', [file]];
}

/**
 * Open the finished report the way a person would, so the run ends on something to read.
 * Never fails the run: a headless box or a missing viewer just gets the path printed.
 * CADDIE_NO_OPEN=1 turns it off for scheduled runs.
 */
export function openReport(file: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CADDIE_NO_OPEN === '1' || env.CI) return false;
  try {
    const [cmd, args] = openCommand(file);
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** Number of pages in a PDF Chrome printed: one /Type /Page object per page. */
export function pdfPageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
}

const NO_BROWSER = 'No Chrome or Edge found for PDF export. Open the .html file in a browser and use Print, Save as PDF; or set CADDIE_BROWSER to a Chrome/Edge executable.';

/** The combined report for one date, written next to the three runs: runs/<date>/Caddie Report - <host> - <date>.pdf */
export function buildCaddieReport(siteDir: string, date: string, opts: { pdf?: boolean } = {}): { html: string; pdf: string | null } {
  const data = loadReportData(siteDir, date);
  if (!data.find && !data.gaps && !data.monday) throw new Error(`No /find, /gaps or /monday run in ${join(siteDir, 'runs', date)}.`);
  const base = join(siteDir, 'runs', date, `Caddie Report - ${data.host} - ${date}`);
  writeFileSync(`${base}.html`, renderCaddieReport(data));
  if (!opts.pdf) return { html: `${base}.html`, pdf: null };
  const browser = findBrowser();
  if (!browser) return { html: `${base}.html`, pdf: null };
  printToPdf(browser, `${base}.html`, `${base}.pdf`);
  return { html: `${base}.html`, pdf: `${base}.pdf` };
}

/** The full per-page scorecard for whoever makes the edits: runs/<date>/find/Implementation Pack - <host> - <date>.pdf */
export function buildPack(run: string, opts: { pdf?: boolean; screenshot?: boolean } = {}): { html: string; pdf: string | null; written: number; total: number } {
  const input = loadRun(run);
  const base = join(run, `Implementation Pack - ${siteHost(input.candidates.site)} - ${input.date}`);
  writeFileSync(`${base}.html`, renderReport(input));
  const out = { html: `${base}.html`, pdf: null as string | null, written: input.pages.filter((p) => p.md).length, total: input.pages.length };
  if (!opts.pdf && !opts.screenshot) return out;
  const browser = findBrowser();
  if (!browser) return out;
  if (opts.pdf) {
    printToPdf(browser, out.html, `${base}.pdf`);
    out.pdf = `${base}.pdf`;
  }
  if (opts.screenshot) screenshot(browser, out.html, join(run, 'report.png'));
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const run = flagString(args, 'run');
  const site = flagString(args, 'site');
  const pdf = flagBool(args, 'pdf');
  let toOpen: string;
  if (flagBool(args, 'report') && site) {
    const cwd = flagString(args, 'cwd') ? resolve(flagString(args, 'cwd') as string) : process.cwd();
    const date = flagString(args, 'date') ?? todayIso();
    const r = buildCaddieReport(siteDir(cwd, site), date, { pdf });
    console.log(`Caddie Report written: ${r.pdf ?? r.html}`);
    if (pdf && !r.pdf) console.log(NO_BROWSER);
    toOpen = r.pdf ?? r.html;
  } else if (run) {
    const r = buildPack(resolve(run), { pdf, screenshot: flagBool(args, 'screenshot') });
    console.log(`Implementation Pack written (${r.written} of ${r.total} pages included): ${r.pdf ?? r.html}`);
    if (pdf && !r.pdf) console.log(NO_BROWSER);
    toOpen = r.pdf ?? r.html;
  } else {
    throw new Error('Usage: node scripts/report.ts --report --site <domain> [--date <yyyy-mm-dd>] [--cwd <dir>] [--pdf] [--open]\n       node scripts/report.ts --run <find run dir> [--pdf] [--screenshot] [--open]');
  }
  if (flagBool(args, 'open')) console.log(openReport(toOpen) ? `Opened ${toOpen}` : `Report ready: ${toOpen}`);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
