'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = new Map([
  ['index.html', 'https://tsiframir.ru/'],
  ['forums/index.html', 'https://tsiframir.ru/forums/'],
  ['forums/2026-saint-petersburg/index.html', 'https://tsiframir.ru/forums/2026-saint-petersburg/'],
  ['tools/index.html', 'https://tsiframir.ru/tools/'],
  ['privacy.html', 'https://tsiframir.ru/privacy.html'],
  ['requisites.html', 'https://tsiframir.ru/requisites.html'],
  ['offer.html', 'https://tsiframir.ru/offer.html'],
  ['payment-result.html', 'https://tsiframir.ru/payment-result.html']
]);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('each public HTML entry has a single absolute canonical and meaningful title', () => {
  for (const [relativePath, canonical] of pages) {
    const html = read(relativePath);
    const canonicals = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]+)"/gi)];
    assert.equal(canonicals.length, 1, `${relativePath}: canonical count`);
    assert.equal(canonicals[0][1], canonical, `${relativePath}: canonical value`);
    assert.match(html, /<title>[^<]{10,}<\/title>/i, `${relativePath}: title`);
  }
});

test('indexable primary pages have one h1 and a useful description', () => {
  for (const relativePath of ['index.html', 'forums/index.html', 'forums/2026-saint-petersburg/index.html', 'tools/index.html']) {
    const html = read(relativePath);
    assert.equal((html.match(/<h1(?:\s|>)/gi) || []).length, 1, `${relativePath}: h1 count`);
    const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    assert.ok(description && description[1].length > 40, `${relativePath}: description`);
  }
});

test('JSON-LD is parseable and archived Event exposes neither offers nor a made-up completed status', () => {
  for (const relativePath of ['index.html', 'forums/index.html', 'forums/2026-saint-petersburg/index.html', 'tools/index.html']) {
    const html = read(relativePath);
    const blocks = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    assert.ok(blocks.length > 0, `${relativePath}: structured data missing`);
    blocks.forEach((block) => JSON.parse(block[1]));
  }
  const archive = read('forums/2026-saint-petersburg/index.html');
  const event = JSON.parse(archive.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i)[1]);
  assert.equal(event['@type'], 'Event');
  assert.equal(event.startDate, '2026-06-13T10:00:00+03:00');
  assert.equal(event.endDate, '2026-06-14T14:30:00+03:00');
  assert.equal('offers' in event, false);
  assert.equal('eventStatus' in event, false);
});

test('robots and sitemap expose only intentional indexable URLs', () => {
  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');
  assert.match(robots, /Sitemap: https:\/\/tsiframir\.ru\/sitemap\.xml/);
  for (const canonical of [...pages.values()].filter((url) => !url.endsWith('/payment-result.html'))) {
    assert.match(sitemap, new RegExp(`<loc>${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  }
  assert.doesNotMatch(sitemap, /payment-result/);
});

test('public pages contain no phone other than the approved number', () => {
  const phonePattern = /(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g;
  for (const relativePath of pages.keys()) {
    const matches = read(relativePath).match(phonePattern) || [];
    for (const phone of matches) {
      assert.equal(phone.replace(/\D/g, '').replace(/^8/, '7'), '79165127377', `${relativePath}: ${phone}`);
    }
  }
});

test('known broken logo path is absent from public sources', () => {
  for (const relativePath of pages.keys()) {
    assert.doesNotMatch(read(relativePath), /HorizontalLogos\.png/i, relativePath);
  }
});

test('public pages do not present unverified media, scarcity or testimonials', () => {
  const publicHtml = [...pages.keys()].map(read).join('\n');
  assert.doesNotMatch(publicHtml, /youtube\.com\/results|остал(?:ось|ись)\s+только\s+\d+|\d+\s+из\s+\d+\s+мест/i);
  assert.doesNotMatch(publicHtml, /class="[^"]*(?:testimonial|review)[^"]*"/i);

  const eventData = JSON.parse(read('assets/data/events.json'));
  const archive = eventData.events.find((event) => event.id === 'forum-2026-saint-petersburg');
  assert.ok(archive, 'archived forum is missing');
  assert.equal(archive.recap.status, 'preparing');
  assert.deepEqual(archive.recap.media, []);
});

test('archive speaker rendering is limited to confirmed names and local photos', () => {
  const renderer = read('assets/js/archive.js');
  assert.match(renderer, /speaker\.name/);
  assert.match(renderer, /speaker\.photo/);
  assert.doesNotMatch(renderer, /speaker\.(?:bio|role|details|url)/);
});
