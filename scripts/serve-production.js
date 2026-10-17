'use strict';

// Small native adapter for the existing, independently tested HTTP handlers.
// Only the build output is public; source files, configuration and secrets are not.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createExistingAIHandler } = require('./existing-ai-backend');

const PUBLIC_ROOT = path.resolve(__dirname, '../public-dist');
const BODY_LIMIT = 16384;
const routes = new Map([
  ['/api/events', require('../api/events')],
  ['/api/ai-interpretation', require('../api/ai-interpretation')],
  ['/api/forum-interest', require('../api/forum-interest')],
  ['/api/seminar-page', require('../api/seminar-page')],
  ['/api/seminar-quote', require('../api/seminar-quote')],
  ['/api/seminar-checkout', require('../api/seminar-checkout')],
  ['/api/seminar-status', require('../api/seminar-status')],
  ['/organizer/seminar-orders', require('../api/seminar-organizer')],
  ['/api/paykeeper/config', require('../api/paykeeper/config')],
  ['/api/paykeeper/checkout', require('../api/paykeeper/checkout')],
  ['/api/paykeeper/callback', require('../api/paykeeper/callback')]
]);
const seminarPaths = new Set([
  '/forums/2026-nizhny-novgorod', '/forums/2026-nizhny-novgorod/',
  '/forums/2026-nizhny-novgorod/index.html'
]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf'
};

function reply(res, code, error) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(code).json({ ok: false, error });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        if (!rejected) { rejected = true; reject(Object.assign(new Error(), { status: 413 })); }
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => { if (!rejected) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
    req.on('aborted', () => reject(new Error()));
  });
}

function createServer({ publicRoot = PUBLIC_ROOT } = {}) {
  const root = fs.realpathSync(publicRoot);
  const existingAI = process.env.SITE_AI_USE_EXISTING_BACKEND === 'true' ? createExistingAIHandler() : null;
  const server = http.createServer({ maxHeaderSize: 16384, requestTimeout: 30000, headersTimeout: 15000 }, async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); return res; };
    res.send = data => { res.end(String(data)); return res; };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // This deployment trusts only nginx, which replaces X-Forwarded-For.
    delete req.headers['x-vercel-forwarded-for'];
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch (_) { return reply(res, 400, 'invalid_path'); }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) return reply(res, 404, 'not_found');
      const apiPath = pathname.replace(/\/$/, '').replace(/\.js$/, '');
      const handler = seminarPaths.has(pathname) ? routes.get('/api/seminar-page') :
        apiPath === '/api/ai-interpretation' && existingAI ? existingAI : routes.get(apiPath);
      if (handler) {
        if (Number(req.headers['content-length'] || 0) > BODY_LIMIT) {
          res.setHeader('Connection', 'close');
          return reply(res, 413, 'payload_too_large');
        }
        const raw = await readBody(req);
        const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        req.query = Object.fromEntries(url.searchParams);
        try {
          req.body = !raw ? {} : type === 'application/json' ? JSON.parse(raw) :
            type === 'application/x-www-form-urlencoded' ? Object.fromEntries(new URLSearchParams(raw)) : raw;
        } catch (_) { return reply(res, 400, 'invalid_json'); }
        return await handler(req, res);
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return reply(res, 405, 'method_not_allowed');
      }
      if (pathname === '/healthz') return res.status(200).json({ ok: true, service: 'tsiframir-site' });
      let file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep) && file !== root) return reply(res, 404, 'not_found');
      let stat;
      try {
        stat = await fs.promises.stat(file);
        if (stat.isDirectory()) {
          if (!pathname.endsWith('/')) {
            res.setHeader('Location', url.pathname + '/' + url.search);
            res.statusCode = 308;
            return res.end();
          }
          file = path.join(file, 'index.html');
          stat = await fs.promises.stat(file);
        }
        const real = await fs.promises.realpath(file);
        if (!real.startsWith(root + path.sep) || !stat.isFile()) return reply(res, 404, 'not_found');
      } catch (_) { return reply(res, 404, 'not_found'); }
      const ext = path.extname(file);
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=300');
      res.setHeader('Content-Length', stat.size);
      if (req.method === 'HEAD') return res.end();
      await pipeline(fs.createReadStream(file), res);
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.destroy();
      if (error.status === 413) res.setHeader('Connection', 'close');
      reply(res, error.status === 413 ? 413 : 500, error.status === 413 ? 'payload_too_large' : 'internal_error');
    }
  });
  server.maxConnections = 128;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8093);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid site port');
  const server = createServer();
  server.listen(port, '127.0.0.1', () => console.log('tsiframir-site listening on loopback'));
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
module.exports = { createServer };
