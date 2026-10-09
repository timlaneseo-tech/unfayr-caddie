import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { CREDIT } from './readme.ts';
import { addDays } from './paths.ts';
import type { Brief, FindPage, ReportData } from './report-data.ts';

/**
 * The report the owner reads: about ten pages, the five moves worth the most on page one,
 * every other page as a checklist, the site-wide problems, the pages to create, and an
 * honest account of what was checked. The full paste-ready instructions live in the
 * Implementation Pack, which this report points to.
 */
const ASSETS = fileURLToPath(new URL('../../assets/', import.meta.url));
const asset = (f: string): string => (existsSync(join(ASSETS, f)) ? readFileSync(join(ASSETS, f), 'utf8') : '');

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const inline = (s: string): string => marked.parseInline(s, { async: false }) as string;
const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
const path = (u: string): string => u.replace(/^https?:\/\/[^/]+/, '') || '/';

/** The first sentences of a diagnosis, so each top fix fits in half a page; the pack keeps the full text. */
export function lead(text: string, sentences = 2, maxWords = 55): string {
  // A sentence ends at . ! or ? (and any closing quote) followed by a space and a capital,
  // so "5.3 to 9.0" and "e.g. this" stay inside their sentence.
  const parts = text.trim().split(/(?<=[.!?]["'”’)\]]*)\s+(?=["“(]?[A-Z0-9])/);
  let out = parts.slice(0, sentences).join(' ').trim();
  const words = out.split(/\s+/);
  if (words.length > maxWords) out = `${words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '')}…`;
  return out;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function clicks(n: number): string {
  if (n >= 1) return `+${fmt(n)} click${Math.round(n) === 1 ? '' : 's'} a month`;
  return 'under 1 click a month';
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function effortChip(e: string): string {
  const cls = e === '5 minutes' ? 'quick' : e === 'Ask your web provider' ? 'provider' : 'half';
  return `<span class="chip ${cls}">${esc(e)}</span>`;
}

function move(p: FindPage, i: number): string {
  return `<li class="move" id="move-${p.slug}">
    <span class="n">${i + 1}</span>
    <div>
      <a class="move-title" href="#fix-${p.slug}">${esc(p.title)}</a>
      <p>${inline(p.oneLine || 'See the fix below.')}</p>
      <p class="meta">${fmt(p.impressions)} searches a month · ${clicks(p.clicks)} · ${effortChip(p.effort)}</p>
    </div>
  </li>`;
}

function fix(p: FindPage, packFile: string): string {
  const blocks = p.keyFixes
    .map((k) => `<div class="kf"><h4>${esc(k.label)}</h4><div class="pair${k.before ? '' : ' one'}">${k.before ? `<pre class="before"><span>Now</span>${esc(k.before)}</pre>` : ''}<pre class="after"><span>${k.before ? 'Change to' : 'Add'}</span>${esc(k.after)}</pre></div></div>`)
    .join('');
  return `<article class="fix" id="fix-${p.slug}">
    <header><h3>${esc(p.title)}</h3><p class="meta"><span class="url">${esc(path(p.url))}</span> ${fmt(p.impressions)} searches a month · ${clicks(p.clicks)} · ${effortChip(p.effort)}</p></header>
    <p class="why">${inline(lead(p.why))}</p>
    ${blocks}
    <p class="more">Every edit for this page, ready to paste: <em>${esc(packFile)}</em>, section ${p.rank}.</p>
  </article>`;
}

function brief(b: Brief): string {
  return `<article class="brief">
    <p class="kind">${b.isEdit ? 'Add to an existing page' : 'New page'} · <span class="url">${esc(b.url)}</span></p>
    <h3>${esc(cap(b.title))}</h3>
    ${b.question ? `<p class="q">Answers: “${esc(b.question)}”</p>` : ''}
    <p>${inline(lead(b.why))}</p>
    ${b.firstParagraph ? `<blockquote>${inline(b.firstParagraph)}</blockquote>` : ''}
  </article>`;
}

function delta(a: number, b: number, lowerBetter = false): string {
  if (!b) return '';
  const pct = Math.round(((a - b) / b) * 100);
  const good = lowerBetter ? a < b : a > b;
  return `<span class="${a === b ? '' : good ? 'up' : 'down'}">${pct > 0 ? '+' : ''}${pct}%</span>`;
}

export function renderCaddieReport(d: ReportData): string {
  const f = d.find;
  const pages = f?.pages ?? [];
  const top = pages.slice(0, 5);
  const rest = pages.slice(5);
  const briefs = d.gaps?.briefs ?? [];
  const m = d.monday;

  const sections: { id: string; title: string; html: string }[] = [];

  if (m) {
    const w = m.thisWeek;
    const l = m.lastWeek;
    const ga = m.ga4?.pages.slice(0, 3) ?? [];
    sections.push({
      id: 'site',
      title: 'How the site is doing',
      html: `<div class="stats">
        <div><b>${fmt(w.clicks)}</b><span>clicks from Google this week</span>${delta(w.clicks, l.clicks)}</div>
        <div><b>${fmt(w.impressions)}</b><span>times the site was shown</span>${delta(w.impressions, l.impressions)}</div>
        <div><b>${(w.ctr * 100).toFixed(1)}%</b><span>of showings clicked</span>${delta(w.ctr, l.ctr)}</div>
        <div><b>${w.position.toFixed(1)}</b><span>average position</span>${delta(w.position, l.position, true)}</div>
      </div>
      <p>${inline(m.weekParagraph)}</p>
      ${ga.length ? `<p class="meta">Top landing pages in GA4 this week: ${ga.map((g) => `${esc(g.path)} (${fmt(g.sessionsThis)} sessions, ${fmt(g.engagedThis)} engaged, ${fmt(g.keyEventsThis)} leads)`).join('; ')}.</p>` : ''}`,
    });
  }
  if (top.length) {
    sections.push({ id: 'top-fixes', title: 'The top fixes, with the words to use', html: top.map((p) => fix(p, f?.packFile ?? '')).join('') });
  }
  if (rest.length) {
    sections.push({
      id: 'checklist',
      title: `Every other page (${rest.length})`,
      html: `<p class="lede">Smaller wins. Each row is one page and one change; the Implementation Pack has the exact text.</p>
      <table class="check"><thead><tr><th></th><th>Page</th><th>What to do</th><th class="num">Searches</th><th>Effort</th></tr></thead><tbody>
      ${rest.map((p) => `<tr id="check-${p.slug}"><td class="box">☐</td><td class="pg"><b>${esc(p.title.startsWith('http') ? path(p.url) : p.title)}</b></td><td>${inline(p.oneLine)}</td><td class="num">${fmt(p.impressions)}</td><td>${effortChip(p.effort)}</td></tr>`).join('')}
      </tbody></table>`,
    });
  }
  if (d.sitewide.length) {
    sections.push({
      id: 'sitewide',
      title: 'Problems across the whole site',
      html: `<p class="lede">These repeat on many pages, so one change to the site's template fixes all of them. Usually a request to whoever runs your website.</p>
      ${d.sitewide.map((i) => `<div class="issue"><h3>${esc(i.title)}</h3><p>${esc(i.detail)}</p></div>`).join('')}`,
    });
  }
  if (briefs.length) {
    sections.push({
      id: 'new-pages',
      title: 'Questions your customers ask that the site does not answer',
      html: `<p class="lede">${d.gaps ? `Caddie checked ${fmt(d.gaps.asked)} questions people in your market ask; ${fmt(d.gaps.open)} have no good answer on your site.` : ''} Each brief below has its opening paragraph written; the full outline is in the gaps folder.</p>
      <div class="briefs">${briefs.map(brief).join('')}</div>`,
    });
  }

  const checked: string[] = [];
  if (f) {
    checked.push(`Search Console: ${fmt(f.totalQueries)} searches people used to find the site, ${esc(f.window.start)} to ${esc(f.window.end)}. ${fmt(f.brandQueries)} of them were for your own name and were left alone.`);
    checked.push(`${fmt(pages.length)} pages read and diagnosed, each with paste-ready edits in the Implementation Pack.`);
    if (f.aiAsked) checked.push(`Google's Gemini was asked ${fmt(f.aiAsked)} questions these pages should win; it mentioned you in ${fmt(f.aiMentions)}.${f.aiMode === 'plain' ? ' (Free mode: Gemini does not say which sites it drew on.)' : ''}`);
  }
  if (d.gaps) checked.push(`${fmt(d.gaps.asked)} customer questions checked against the site.`);
  if (d.sitewide.length) checked.push(`${d.sitewide.length} site-wide problem${d.sitewide.length === 1 ? '' : 's'} found by comparing every page.`);
  if (m) checked.push(m.ga4 ? 'GA4: connected; landing pages and leads are in the weekly memo.' : 'GA4: not connected for this site, so leads are not counted.');
  const skipped = [...(f?.skipped ?? []), ...(d.gaps?.skipped ?? [])].filter((s) => !/^Page fetch failed/.test(s)).slice(0, 6);
  sections.push({
    id: 'checked',
    title: 'What Caddie checked',
    html: `<ul class="facts">${checked.map((c) => `<li>${c}</li>`).join('')}</ul>${skipped.length ? `<p class="meta">Left out: ${skipped.map(esc).join(' · ')}</p>` : ''}`,
  });
  const total = pages.length + briefs.length;
  sections.push({
    id: 'next',
    title: 'Next week',
    html: `<p>Make the edits you agree with, then run Caddie again on ${esc(longDate(addDays(d.date, 7)))}. Say <b>“Run my site ${esc(d.host)} through the entire Caddie process”</b> and the memo will say which of these ${fmt(total)} suggestions are live and what their searches did. Search results usually move two to four weeks after an edit.</p>`,
  });

  const strip = [
    f ? [fmt(f.totalQueries), 'searches analysed'] : null,
    f ? [fmt(pages.length), 'pages diagnosed'] : null,
    f?.aiAsked ? [fmt(f.aiAsked), 'AI answers checked'] : null,
    d.gaps ? [fmt(d.gaps.asked), 'customer questions checked'] : null,
    [fmt(total), 'fixes ready to paste'],
  ].filter((x): x is string[] => !!x);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Caddie Report: ${esc(d.host)}, ${esc(d.date)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { --ultra:#1E1BF5; --ink:#000; --paper:#fff; --fog:#ECECF2; --slate:#5B5B66; --turf:#1B6B3A; --flag:#B42318;
    --sans:"Space Grotesk","Helvetica Neue",Arial,sans-serif; --mono:"IBM Plex Mono",Consolas,monospace; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:var(--sans); line-height:1.45; font-size:15px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  a { color:inherit; text-decoration:none; }
  a:hover { text-decoration:underline; text-decoration-color:var(--ultra); }
  .sheet { max-width:48rem; margin:0 auto; padding:2rem 1.25rem 3rem; }
  .brand { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; }
  .brand svg { height:2.2rem; width:auto; }
  .site { text-align:right; color:var(--slate); font-size:.9rem; }
  .site strong { display:block; color:var(--ink); font-weight:500; font-size:1rem; }
  h1 { font-size:2.3rem; line-height:1.05; letter-spacing:-.015em; margin:1.4rem 0 .4rem; }
  .rule { height:3px; width:5rem; background:var(--ultra); border-radius:2px; margin:.6rem 0 1rem; }
  .lede { color:var(--slate); margin:.2rem 0 .9rem; max-width:62ch; }
  .moves { list-style:none; padding:0; margin:0; display:grid; gap:.55rem; }
  .move { display:grid; grid-template-columns:2.2rem 1fr; gap:.6rem; padding:.7rem .8rem; border:1px solid var(--fog); border-left:3px solid var(--ultra); border-radius:4px; break-inside:avoid; }
  .move .n { font-size:1.6rem; font-weight:700; color:var(--ultra); line-height:1; }
  .move-title { font-weight:700; font-size:1.02rem; }
  .move p { margin:.2rem 0 0; }
  .meta { color:var(--slate); font-size:.82rem; margin:.25rem 0 0; }
  .chip { display:inline-block; font-size:.72rem; font-weight:500; padding:.05rem .45rem; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }
  .chip.quick { color:var(--turf); } .chip.half { color:var(--ultra); } .chip.provider { color:var(--flag); }
  .strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(7rem,1fr)); gap:.5rem; margin-top:1.1rem; padding-top:.9rem; border-top:1px solid var(--ink); }
  .strip div b { display:block; font-size:1.5rem; line-height:1.1; }
  .strip div span { color:var(--slate); font-size:.78rem; }
  nav.toc { margin:0 0 1.4rem; }
  nav.toc h2 { margin-top:0; }
  nav.toc ol { margin:0; padding-left:1.2rem; columns:2; }
  nav.toc li { margin:.15rem 0; }
  h2 { font-size:1.35rem; letter-spacing:-.01em; margin:1.8rem 0 .4rem; padding-top:.6rem; border-top:1px solid var(--ink); }
  h3 { font-size:1.05rem; margin:0 0 .2rem; }
  h4 { font-size:.8rem; font-weight:500; color:var(--slate); text-transform:uppercase; letter-spacing:.04em; margin:.7rem 0 .25rem; }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:.6rem; margin:.6rem 0; }
  .stats div { background:var(--fog); border-radius:4px; padding:.55rem .6rem; }
  .stats b { display:block; font-size:1.3rem; }
  .stats span { display:block; color:var(--slate); font-size:.76rem; }
  .up { color:var(--turf); font-weight:500; font-size:.8rem; } .down { color:var(--flag); font-weight:500; font-size:.8rem; }
  .fix { padding:.7rem 0; border-bottom:1px solid var(--fog); break-inside:avoid; }
  .fix .url, .check .url, .brief .url { font-family:var(--mono); font-size:.74rem; color:var(--slate); word-break:break-all; }
  .check .url { display:block; }
  .why { margin:.45rem 0; }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; } .pair.one { grid-template-columns:1fr; }
  pre { font-family:var(--mono); font-size:.72rem; line-height:1.45; white-space:pre-wrap; word-break:break-word; margin:.25rem 0; padding:.55rem .7rem; border-radius:4px; }
  pre span { display:block; font-family:var(--sans); font-size:.68rem; font-weight:500; color:var(--slate); margin-bottom:.15rem; }
  pre.before { background:var(--fog); }
  pre.after { border:1.5px solid var(--ultra); } pre.after span { color:var(--ultra); }
  .more { font-size:.8rem; color:var(--slate); margin:.4rem 0 0; }
  table.check { width:100%; border-collapse:collapse; font-size:.78rem; table-layout:fixed; }
  .check th:nth-child(1) { width:1.4rem; } .check th:nth-child(2) { width:30%; } .check th:nth-child(4) { width:4.2rem; } .check th:nth-child(5) { width:7.8rem; }
  .check td.pg b { font-weight:500; }
  .check th { text-align:left; font-weight:500; color:var(--slate); border-bottom:1px solid var(--ink); padding:.25rem .4rem .3rem 0; }
  .check td { vertical-align:top; padding:.35rem .4rem .35rem 0; border-bottom:1px solid var(--fog); }
  .check tr { break-inside:avoid; }
  .check .box { font-size:1rem; width:1.4rem; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .issue { padding:.5rem 0 .5rem .8rem; border-left:3px solid var(--flag); margin:.5rem 0; break-inside:avoid; }
  .issue p { margin:.15rem 0 0; }
  .briefs { display:grid; gap:.7rem; }
  .brief { padding:.75rem .85rem; border:1px solid var(--fog); border-radius:4px; break-inside:avoid; }
  .brief .kind { margin:0 0 .2rem; font-size:.74rem; font-weight:500; color:var(--ultra); text-transform:uppercase; letter-spacing:.04em; }
  .brief .q { margin:.1rem 0; font-weight:500; }
  .brief p { margin:.3rem 0; }
  blockquote { margin:.4rem 0 0; padding:.5rem .75rem; border-left:3px solid var(--ultra); background:var(--fog); font-size:.86rem; }
  .facts { padding-left:1.1rem; margin:.4rem 0; } .facts li { margin:.25rem 0; }
  footer { margin-top:2rem; padding-top:.8rem; border-top:1px solid var(--fog); display:flex; justify-content:space-between; color:var(--slate); font-size:.8rem; }
  footer svg { height:1.3rem; width:auto; }
  @media (max-width:40rem) { .stats { grid-template-columns:repeat(2,1fr); } nav.toc ol { columns:1; } }
  @media print {
    @page { size:Letter; margin:14mm 15mm 15mm; }
    body { font-size:10pt; }
    .sheet { max-width:none; padding:0; }
    .cover { break-after:page; }
    h2 { break-after:avoid; }
  }
</style>
</head>
<body>
<main class="sheet">
  <section class="cover">
    <div class="brand">${asset('caddie-lockup-on-light.svg')}<div class="site"><strong>${esc(d.host)}</strong>${esc(longDate(d.date))}</div></div>
    <h1>Your top 5 moves this week</h1>
    <div class="rule"></div>
    <p class="lede">Ranked by what each is worth. Most take minutes; a few need whoever runs your website. Start at number 1.</p>
    <ol class="moves">${top.map(move).join('')}</ol>
    <div class="strip">${strip.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>
  </section>

  <nav class="toc"><h2>Contents</h2><ol>${sections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ol>
  ${f ? `<p class="meta">For whoever makes the edits: <em>${esc(f.packFile)}</em> in this folder has every change for every page, ready to paste.</p>` : ''}</nav>

  ${sections.map((s) => `<section><h2 id="${s.id}">${esc(s.title)}</h2>${s.html}</section>`).join('\n')}

  <footer><span>${esc(CREDIT)}</span>${asset('caddie-mark.svg')}</footer>
</main>
</body>
</html>
`;
}
