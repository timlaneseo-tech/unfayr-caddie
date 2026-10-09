import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchPage, samplePage } from '../scripts/fetch-page.ts';
import { contentHashOf, extract, isProse } from '../scripts/lib/extract.ts';
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

  it('reads spec blocks written as divs with line breaks, without duplicating p text', () => {
    const html = `<html><head><title>Loader</title></head><body><main><h1>Develon DL250-7</h1>
      <div class="desc">GREAT SNOW LEASE RATES AVAILABLE!<br>- GVW: 30891 Lbs<br>- Engine: Doosan, HP 171.7<br>- Dump Height: 10'7"<br>- Tire Size: 20.5R25 Radial</div>
      <div class="wrap"><p>Delivery available across Iowa and Minnesota.</p></div>
      <div class="tiny">Share</div>
    </main></body></html>`;
    const ex = extract(html, 'https://x.example/inv');
    expect(ex.paragraphs).toEqual([
      'Delivery available across Iowa and Minnesota.',
      "GREAT SNOW LEASE RATES AVAILABLE! - GVW: 30891 Lbs - Engine: Doosan, HP 171.7 - Dump Height: 10'7\" - Tire Size: 20.5R25 Radial",
    ]);
    expect(ex.paragraphs.join(' ')).not.toContain('Share');
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

  it('ignores rotating card blocks in the content hash but not prose edits', () => {
    const prose = 'RTL Equipment is a full-service heavy construction equipment dealership serving customers throughout the Midwest since 1988.';
    const page = (card: string, body: string) => `<html><head><title>T</title></head><body><main><h1>H</h1><h3>${card}</h3><p>LocationBig Lake ConditionPre-Owned Make${card} Stock #1 Notes Mileage0</p><p>${body}</p></main></body></html>`;
    const a = extract(page('Caterpillar D6K2', prose), 'u');
    const b = extract(page('Develon DX350', prose), 'u');
    const c = extract(page('Caterpillar D6K2', prose.replace('1988', '1989')), 'u');
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).not.toBe(c.contentHash);
    expect(isProse(prose)).toBe(true);
    expect(isProse('LocationBig Lake ConditionPre-Owned YearN/A MakeEdge Innovative ModelEDGE 622 TypeAggregate Equipment ClassScreen Stock #13681')).toBe(false);
  });

  it('treats an inventory card with a sentence in its notes as a card, and hashes the same from an extract', () => {
    const card = 'Price$219,995.00 LocationBig Lake ConditionNew Year2023 MakeDevelon ModelDX350LCR-7 (US20) TypeEquipment ClassExcavator Stock #15832 Notes3yr/3k full warranty starting day of purchase! Operating Weight: 83477 lbs. Mileage0 2023DevelonDX350LCR-7 (US20)';
    expect(isProse(card)).toBe(false);
    expect(isProse('Magnetek, now part of Columbus McKinnon, makes crane controls that RTL Equipment does not stock or service today.')).toBe(true);
    const prose = 'RTL Equipment is a full-service heavy construction equipment dealership serving customers throughout the Midwest since 1988.';
    const page = (first: string, second: string) => `<html><head><title>T</title></head><body><main><h1>H</h1><p>${first}</p><p>${second}</p><p>${prose}</p></main></body></html>`;
    const other = 'LocationGrimes ConditionPre-Owned Year2021 MakeDevelon ModelDL580-5 (US30) TypeWheel Loader ClassWheel Loader Stock #13835 NotesOperating Weight: 79433 Lbs, Bucket Capacity 9.0 cy. Mileage0 2021DevelonDL580-5 (US30)';
    const a = extract(page(card, other), 'u');
    const b = extract(page(other, card), 'u');
    expect(a.contentHash).toBe(b.contentHash);
    expect(contentHashOf(a)).toBe(a.contentHash);
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

  it('retries a 403 with curl, same user agent, and keeps the failure when curl is refused too or missing', async () => {
    const blocked = (async () => new Response('challenge', { status: 403, headers: { 'content-type': 'text/html' } })) as typeof fetch;
    const calls: string[] = [];
    const ok = await fetchPage('https://x.example/cost', {
      fetchImpl: blocked,
      userAgent: 'caddie-test',
      curlImpl: async (url, ua) => {
        calls.push(`${url} ${ua}`);
        return { status: 200, contentType: 'text/html; charset=utf-8', body: summit('plumbing-cost-guide') };
      },
    });
    expect(calls).toEqual(['https://x.example/cost caddie-test']);
    expect(ok.status).toBe('ok');
    expect(ok.httpStatus).toBe(200);
    expect(ok.h1).toBe('What Does a Plumber Cost in Boise?');

    const stillBlocked = await fetchPage('https://x.example/cost', { fetchImpl: blocked, curlImpl: async () => ({ status: 403, contentType: 'text/html', body: '' }) });
    expect(stillBlocked.status).toBe('failed');
    expect(stillBlocked.error).toBe('HTTP 403');

    const noCurl = await fetchPage('https://x.example/cost', { fetchImpl: blocked, curlImpl: async () => null });
    expect(noCurl.error).toBe('HTTP 403');

    let curled = false;
    await fetchPage('https://x.example/missing', {
      fetchImpl: (async () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } })) as typeof fetch,
      curlImpl: async () => {
        curled = true;
        return null;
      },
    });
    expect(curled).toBe(false);
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
