'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { createServer } = require('../scripts/serve-production');
let server, base, temporary;
before(async () => {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tsiframir-http-'));
  fs.mkdirSync(path.join(temporary, 'archive'));
  fs.writeFileSync(path.join(temporary, 'index.html'), '<h1>public</h1>');
  fs.writeFileSync(path.join(temporary, 'archive/index.html'), '<h1>archive</h1>');
  fs.writeFileSync(path.join(temporary, 'app.js'), 'console.log("asset")');
  fs.symlinkSync(__filename, path.join(temporary, 'leak.js'));
  server = createServer({ publicRoot: temporary });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
});
test('public GET/HEAD, directory and queries preserve assets', async () => {
  let response = await fetch(base + '/');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '<h1>public</h1>');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  response = await fetch(base + '/app.js?v=release', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.equal(await response.text(), '');
  response = await fetch(base + '/archive?x=1', { redirect: 'manual' });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), '/archive/?x=1');
  assert.equal(await (await fetch(base + '/archive/')).text(), '<h1>archive</h1>');
});
test('private source, traversal, dot paths and external symlinks stay private', async () => {
  for (const url of ['/api/lib/seminar-runtime.js', '/scripts/serve-production.js', '/.git/config', '/.env', '/leak.js', '/%2e%2e%2fpackage.json', '/%00']) {
    assert.equal((await fetch(base + url)).status, 404, url);
  }
  assert.equal((await fetch(base + '/%ZZ')).status, 400);
});
test('every existing public handler is routed and seminar aliases render dynamically', async () => {
  for (const url of ['/api/events', '/api/seminar-quote']) assert.equal((await fetch(base + url)).status, 200, url);
  assert.equal((await fetch(base + '/api/paykeeper/config')).status, 410); // June event is closed.
  for (const url of ['/api/forum-interest', '/api/seminar-checkout', '/api/seminar-status', '/api/paykeeper/checkout', '/api/paykeeper/callback', '/api/ai-interpretation']) assert.equal((await fetch(base + url)).status, 405, url);
  for (const url of ['/api/seminar-page', '/forums/2026-nizhny-novgorod', '/forums/2026-nizhny-novgorod/', '/forums/2026-nizhny-novgorod/index.html']) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200, url);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(await response.text(), /2026/);
  }
  assert.equal((await fetch(base + '/api/events.js')).status, 200);
});
test('JSON parsing, size and method limits reach handlers safely', async () => {
  const post = body => fetch(base + '/api/seminar-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal((await post('{broken')).status, 400);
  assert.equal((await post('x'.repeat(16385))).status, 413);
  assert.equal((await post('{}')).status, 404); // Unknown event is rejected by the existing policy.
  assert.equal((await fetch(base + '/', { method: 'POST', body: '{}' })).status, 405);
  // Exercise chunked requests too: no Content-Length may bypass the body cap.
  const status = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/seminar-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.write('x'.repeat(8192)); req.write('x'.repeat(8193)); req.end();
  });
  assert.equal(status, 413);
});
test('provider form callback authenticates with unchanged handler semantics', async () => {
  const prior = process.env.PAYKEEPER_SECRET;
  process.env.PAYKEEPER_SECRET = 'test-adapter-secret-not-production';
  try {
    const data = { id: '123', sum: '1600.00', clientid: 'Adapter Test', orderid: 'TSMNN-20261101-EARLY-12345678-1234-4123-8123-123456789abc' };
    const md5 = value => crypto.createHash('md5').update(value).digest('hex');
    data.key = md5(data.id + data.sum + data.clientid + data.orderid + process.env.PAYKEEPER_SECRET);
    const response = await fetch(base + '/api/paykeeper/callback', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'OK ' + md5(data.id + process.env.PAYKEEPER_SECRET));
  } finally { if (prior === undefined) delete process.env.PAYKEEPER_SECRET; else process.env.PAYKEEPER_SECRET = prior; }
});
