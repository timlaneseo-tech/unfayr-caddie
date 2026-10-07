#!/usr/bin/env node
/**
 * Lint the page files in a /find run before the owner sees them.
 *
 *   node scripts/check-page.ts --run sites/example.com/runs/2026-10-07/find
 *
 * Checks what a writer gets wrong when counting by eye: title length, meta
 * description length, answer paragraph word counts, FAQ text matching its JSON-LD,
 * the fixed section headings, the credit line, and changes.json referring to real
 * pages and kinds. Exit code 1 when anything fails, so the command can stop and fix.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, flagString } from './lib/args.ts';
import { validateChanges } from './lib/ledger.ts';
import { CREDIT, PENDING } from './lib/readme.ts';
import type { CandidatesFile } from './lib/types.ts';

export interface Finding {
  file: string;
  level: 'error' | 'warn';
  message: string;
}

const REQUIRED_SECTIONS = ['## Queries', '## Why it sits here', '## Fixes', '## Verify'];

function fenced(text: string): string[] {
  return [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/** The text of the first fenced block after `After:` inside the named fix section. */
function afterBlock(text: string, fixHeading: RegExp): string | null {
  const m = fixHeading.exec(text);
  if (!m) return null;
  const start = m.index;
  const next = text.indexOf('\n### ', start + 1);
  const section = text.slice(start, next === -1 ? undefined : next);
  const after = section.indexOf('After:');
  if (after === -1) return null;
  const blocks = fenced(section.slice(after));
  return blocks[0]?.trim() ?? null;
}

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function checkPageFile(text: string, file: string): Finding[] {
  const out: Finding[] = [];
  const err = (message: string) => out.push({ file, level: 'error', message });
  const warn = (message: string) => out.push({ file, level: 'warn', message });

  for (const s of REQUIRED_SECTIONS) if (!text.includes(`\n${s}`)) err(`missing section "${s}"`);
  if (!text.trimEnd().endsWith(CREDIT)) err(`last line must be "${CREDIT}"`);
  if (!/two to four weeks/i.test(text)) warn('Verify section should say movement typically shows in two to four weeks');

  // A Why line that claims a count is checked against the measured one, because a
  // wrong number next to the text it describes is the fastest way to lose trust.
  const claimed = (fixHeading: RegExp): number | null => {
    const m = fixHeading.exec(text);
    if (!m) return null;
    const next = text.indexOf('\n### ', m.index + 1);
    const section = text.slice(m.index, next === -1 ? undefined : next);
    const why = /Why:[^\n]*?(\d+) characters/.exec(section);
    return why ? Number(why[1]) : null;
  };

  const title = afterBlock(text, /### \d+\. Title/);
  if (title !== null) {
    const n = title.length;
    if (n > 60) err(`title is ${n} characters (max 60): "${title}"`);
    else if (n < 40) warn(`title is ${n} characters (aim for 50-60): "${title}"`);
    const c = claimed(/### \d+\. Title/);
    if (c !== null && c !== n) err(`title Why line says ${c} characters but it is ${n}`);
  }
  const meta = afterBlock(text, /### \d+\. Meta description/);
  if (meta !== null) {
    const n = meta.length;
    if (n > 160) err(`meta description is ${n} characters (max 160)`);
    else if (n < 120) warn(`meta description is ${n} characters (aim for 140-160)`);
    const c = claimed(/### \d+\. Meta description/);
    if (c !== null && c !== n) err(`meta Why line says ${c} characters but it is ${n}`);
  }

  // Answer paragraphs: prose paragraphs inside fenced blocks that sit under a question heading.
  for (const block of fenced(text)) {
    if (block.trim().startsWith('{')) continue;
    const parts = block.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.startsWith('#') || p.startsWith('**')) continue;
      const underQuestion = i > 0 && parts[i - 1].startsWith('## ') && parts[i - 1].includes('?');
      const n = words(p);
      if (underQuestion && n > 80) err(`answer paragraph is ${n} words (max 80): "${p.slice(0, 60)}..."`);
      if (underQuestion && n < 40) warn(`answer paragraph is ${n} words (aim for 40-80): "${p.slice(0, 60)}..."`);
    }
  }

  // FAQ: every visible bold question must appear in the JSON-LD with the same answer text.
  const faqIdx = text.search(/### \d+\. FAQ/);
  if (faqIdx !== -1) {
    const section = text.slice(faqIdx);
    const visible = [...section.matchAll(/\*\*(.+?\?)\*\*\n(.+)/g)].map((m) => ({ q: m[1].trim(), a: m[2].trim() }));
    const jsonBlock = fenced(section).find((b) => b.trim().startsWith('{'));
    if (!jsonBlock) {
      warn('FAQ section has no JSON-LD block');
    } else {
      interface FaqLd {
        mainEntity?: { name?: string; acceptedAnswer?: { text?: string } }[];
      }
      let ld: FaqLd | null = null;
      try {
        ld = JSON.parse(jsonBlock) as FaqLd;
      } catch {
        err('FAQ JSON-LD does not parse');
      }
      if (ld) {
        const ents = ld.mainEntity ?? [];
        if (ents.length !== visible.length) err(`FAQ has ${visible.length} visible questions but ${ents.length} in JSON-LD`);
        for (const v of visible) {
          const e = ents.find((x) => x.name === v.q);
          if (!e) err(`FAQ question not in JSON-LD: "${v.q}"`);
          else if ((e.acceptedAnswer?.text ?? '').trim() !== v.a) err(`FAQ answer differs from JSON-LD for "${v.q}"`);
        }
        for (const v of visible) if (words(v.a) > 60) warn(`FAQ answer is ${words(v.a)} words (aim for 20-50): "${v.q}"`);
      }
    }
    if (visible.length > 0 && visible.length < 3) warn(`FAQ has ${visible.length} questions; the block is earned at three or more`);
  }

  return out;
}

export function checkRun(run: string): Finding[] {
  const out: Finding[] = [];
  const candidatesFile = join(run, 'candidates.json');
  if (!existsSync(candidatesFile)) return [{ file: run, level: 'error', message: 'no candidates.json; run find.ts first' }];
  const candidates = JSON.parse(readFileSync(candidatesFile, 'utf8')) as CandidatesFile;

  for (const p of candidates.pages) {
    const f = join(run, `${p.slug}.md`);
    if (!existsSync(f)) {
      out.push({ file: `${p.slug}.md`, level: 'error', message: 'page file not written' });
      continue;
    }
    out.push(...checkPageFile(readFileSync(f, 'utf8'), `${p.slug}.md`));
  }

  const readme = join(run, 'README.md');
  if (existsSync(readme)) {
    const n = readFileSync(readme, 'utf8').split(PENDING).length - 1;
    if (n) out.push({ file: 'README.md', level: 'error', message: `${n} "${PENDING}" cells still to fill` });
  }

  const changes = join(run, 'changes.json');
  if (!existsSync(changes)) {
    out.push({ file: 'changes.json', level: 'error', message: 'not written' });
  } else {
    try {
      const list = validateChanges(JSON.parse(readFileSync(changes, 'utf8')));
      const pages = new Set(candidates.pages.map((p) => p.page));
      for (const [i, c] of list.entries()) {
        if (!pages.has(c.page)) out.push({ file: 'changes.json', level: 'error', message: `entry ${i}: page not in candidates.json: ${c.page}` });
      }
      const written = new Set(list.map((c) => c.page));
      for (const p of candidates.pages) {
        if (!written.has(p.page) && existsSync(join(run, `${p.slug}.md`))) out.push({ file: 'changes.json', level: 'warn', message: `no entries for ${p.slug}` });
      }
    } catch (e) {
      out.push({ file: 'changes.json', level: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  for (const name of readdirSync(run)) {
    if (name.endsWith('.md') && name !== 'README.md' && !candidates.pages.some((p) => `${p.slug}.md` === name)) {
      out.push({ file: name, level: 'warn', message: 'page file does not match any candidate slug' });
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const run = flagString(args, 'run');
  if (!run) throw new Error('Usage: node scripts/check-page.ts --run <dir>');
  const findings = checkRun(run);
  for (const f of findings) console.log(`${f.level === 'error' ? 'ERROR' : 'warn '}  ${f.file}: ${f.message}`);
  const errors = findings.filter((f) => f.level === 'error').length;
  console.log(errors ? `${errors} error(s), ${findings.length - errors} warning(s). Fix the errors before recording the ledger.` : `OK: ${findings.length} warning(s), no errors.`);
  if (errors) process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
