import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchPage, samplePage } from '../scripts/fetch-page.ts';
import { extract } from '../scripts/lib/extract.ts';
import { FIXTURES_DIR } from '../scripts/lib/fixtures.ts';

const summit = (slug: string) => readFileSync(join(FIXTURES_DIR, 'summitplumbing.example', 'pages', `${slug}.html`), 'utf8');

describe('extract on fixture pages', () => {
  it('reads the leak post structure', () => {
    const ex = extract(summit('blog-why-is-my-water-heater-leaking'), 'https://summitplumbing.example/blog/why-is-my-water-heater-leaking');
    expect(ex.status).toBe('ok');
    expect(ex.title).toBe("Water Heater Leaking? Here's What to Do | Summit Plumbing");
    expect(ex.h1).toBe('Why Is My Water Heater Leaking?');
    expect(ex.metaDescription).toMatch(/leak/i);
    expect(ex.canonical).toBe('https://summitplumbing.example/blog/why-is-my-water-heater-leaking');
    expect(ex.headings.filter((h) => h.level === 2).length).toBeGreaterThanOrEqual(4);
    expect(ex.paragraphs.length).toBeGreaterThan(8);
    expect(ex.wordCount).toBeGreaterThan(400);
    expect(ex.jsonLd.length).toBe(1);
    expect(ex.faq).toEqual([]);
    // Navigation and footer text must not leak into the paragraphs.
    expect(ex.paragraphs.join(' ')).not.toMatch(/Call \(208\)/);
  });

  it('reads FAQ pairs from details blocks and from FAQPage JSON-LD', () => {
    const tankless = extract(summit('tankless-water-heaters'), 'https://summitplumbing.example/tankless-water-heaters');
    expect(tankless.faq.length).toBeGreaterThanOrEqual(3);
    expect(tankless.faq[0].question).toMatch(/\?$/);

    const html = `<html><head><title>T</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Is it free?","acceptedAnswer":{"@type":"Answer","text":"<p>Yes, it is free.</p>"}}]}</script></head><body><main><h1>H</h1>${'<p>twenty characters of text here.</p>'.repeat(30)}</main></body></html>`;
    const ex = extract(html, 'https://x.example/');
    expect(ex.faq).toEqual([{ question: 'Is it free?', answer: 'Yes, it is free.' }]);
  });

  it('marks a JavaScript shell as thin', () => {
    const ex = extract('<html><head><title>App</title></head><body><div id="app"></div><script>window.__x=1</script></body></html>', 'https://x.example/app');
    expect(ex.status).toBe('thin');
    expect(ex.h1).toBeNull();
    expect(ex.wordCount).toBe(0);
    expect(ex.contentHash).not.toBeNull();
  });

  it('hashes content, not markup', () => {
    const page = (p: string) => `<html><head><title>T</title></head><body><main><h1>H</h1><p>${p}</p></main></body></html>`;
    const a = extract(page('The answer is forty-two, every time.'), 'u');
    const b = extract(page('The answer is forty-two, every time.').replace('<main>', '<main class="x">'), 'u');
    const c = extract(page('The answer is forty-three, every time.'), 'u');
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).not.toBe(c.contentHash);
  });

  it('skips broken JSON-LD without failing', () => {
    const ex = extract('<html><head><script type="application/ld+json">{not json</script></head><body><h1>x</h1></body></html>', 'u');
    expect(ex.jsonLd).toEqual([]);
  });
});

describe('fetchPage', () => {
  it('records HTTP failures and timeouts instead of throwing', async () => {
    const notFound = await fetchPage('https://x.example/missing', {
      fetchImpl: (async () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })) as typeof fetch,
    });
    expect(notFound.status).toBe('failed');
    expect(notFound.httpStatus).toBe(404);

    const slow = await fetchPage('https://x.example/slow', {
      timeoutMs: 20,
      fetchImpl: ((_: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })) as unknown as typeof fetch,
    });
    expect(slow.status).toBe('failed');
    expect(slow.error).toMatch(/Timed out/);

    const pdf = await fetchPage('https://x.example/file.pdf', {
      fetchImpl: (async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })) as typeof fetch,
    });
    expect(pdf.status).toBe('failed');
    expect(pdf.error).toMatch(/Not an HTML page/);
  });

  it('extracts a successful HTML response', async () => {
    const ex = await fetchPage('https://x.example/ok', {
      fetchImpl: (async () => new Response(summit('plumbing-cost-guide'), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })) as typeof fetch,
    });
    expect(ex.status).toBe('ok');
    expect(ex.h1).toBe('What Does a Plumber Cost in Boise?');
  });
});

describe('samplePage', () => {
  it('reads fixture HTML by slug and reports missing fixtures as failed', () => {
    expect(samplePage('summitplumbing.example', 'https://summitplumbing.example/drain-cleaning').status).toBe('ok');
    expect(samplePage('summitplumbing.example', 'https://summitplumbing.example/nope').status).toBe('failed');
  });
});
