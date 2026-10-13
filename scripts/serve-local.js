'use strict';
// Local verification only. Production uses the existing Vercel routes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const routes = new Map([
  ['/api/events', require('../api/events')],
  ['/api/seminar-quote', require('../api/seminar-quote')],
  ['/api/seminar-checkout', require('../api/seminar-checkout')],
  ['/api/paykeeper/config', require('../api/paykeeper/config')],
  ['/api/paykeeper/checkout', require('../api/paykeeper/checkout')],
  ['/api/paykeeper/callback', require('../api/paykeeper/callback')],
  ['/api/forum-interest', require('../api/forum-interest')],
  ['/forums/2026-nizhny-novgorod/', require('../api/seminar-page')],
  ['/forums/2026-nizhny-novgorod', require('../api/seminar-page')],
  ['/forums/2026-nizhny-novgorod/index.html', require('../api/seminar-page')]
]);
http.createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
  res.send = data => { res.end(String(data)); return res; };
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (routes.has(url.pathname)) {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 16384) return res.status(413).send('Too large'); }
      req.body = body ? (req.headers['content-type']?.includes('application/json') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body))) : {};
      return await routes.get(url.pathname)(req, res);
    }
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    if (!/^(assets\/|img\/|forums\/|tools\/|index\.html$|offer\.html$|privacy\.html$|requisites\.html$|payment-result\.html$|sitemap\.xml$|robots\.txt$)/.test(relative)) return res.status(404).send('Not found');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) return res.status(404).send('Not found');
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  } catch (_) { res.status(404).send('Not found'); }
}).listen(4174, '127.0.0.1');
