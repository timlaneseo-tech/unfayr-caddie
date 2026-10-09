import { describe, expect, it } from 'vitest';
import { extract } from '../scripts/lib/extract.ts';
import { aboutLink, profileFacts } from '../scripts/lib/profile.ts';

const home = `<html><head><title>Heavy Equipment Dealer | Acme Equipment Co</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Acme Equipment Co","telephone":"(319) 555-0100",
"address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Swisher","addressRegion":"IA","postalCode":"52338"},"brand":[{"@type":"Brand","name":"DEVELON"},"Bobcat"]}</script></head>
<body><nav><a href="/inventory">Inventory</a><a href="/about-us--info">About Us</a></nav>
<main><h1>New and Used Heavy Equipment</h1><h2>Cranes for sale and rent</h2><p>Acme sells cranes, excavators and loaders across Iowa and Minnesota from two stores.</p></main></body></html>`;

describe('profile facts', () => {
  it('collects names, addresses, phones, brands and headings, plus the top non-brand queries', () => {
    const p = profileFacts(extract(home, 'https://acme.example/'), null, [
      { query: 'crane rental iowa', impressions: 300 },
      { query: 'used excavators', impressions: 120 },
    ]);
    expect(p.names).toEqual(['Acme Equipment Co']);
    expect(p.addresses).toEqual(['1 Main St, Swisher, IA 52338']);
    expect(p.phones).toEqual(['(319) 555-0100']);
    expect(p.brands).toEqual(['DEVELON', 'Bobcat']);
    expect(p.headings).toContain('Cranes for sale and rent');
    expect(p.titles).toEqual(['Heavy Equipment Dealer | Acme Equipment Co']);
    expect(p.topQueries).toEqual(['crane rental iowa', 'used excavators']);
  });

  it('keeps the prose that describes the business and drops search-operator queries', () => {
    const about = extract('<html><body><main><h1>About</h1><p>Acme was founded in 1988 and sells cranes from stores in Swisher and Grimes, Iowa.</p><p>Short.</p></main></body></html>', 'https://acme.example/about');
    const p = profileFacts(extract(home, 'https://acme.example/'), about, [
      { query: 'site:acme.example', impressions: 900 },
      { query: 'acme cranes', impressions: 10 },
    ]);
    expect(p.prose).toEqual([
      'Acme sells cranes, excavators and loaders across Iowa and Minnesota from two stores.',
      'Acme was founded in 1988 and sells cranes from stores in Swisher and Grimes, Iowa.',
    ]);
    expect(p.topQueries).toEqual(['acme cranes']);
  });

  it('finds the about page link on the same site', () => {
    expect(aboutLink(home, 'https://acme.example/')).toBe('https://acme.example/about-us--info');
    expect(aboutLink('<a href="https://other.example/about">x</a>', 'https://acme.example/')).toBeNull();
  });
});
