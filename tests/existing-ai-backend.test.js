'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { createExistingAIHandler } = require('../scripts/existing-ai-backend');
const { createServer } = require('../scripts/serve-production');

function response() {
  return Object.assign(new EventEmitter(), { headers: {}, statusCode: 200,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, end() {} });
}
function request() {
  return Object.assign(new EventEmitter(), { method: 'POST', headers: {
    origin: 'https://tsiframir.ru', 'content-type': 'application/json',
    'x-requested-with': 'tsiframir-calculator', cookie: 'private', authorization: 'private',
    'x-vercel-protection-bypass': 'private', 'x-forwarded-for': 'spoofed'
  }, body: { number: 7, calculatorType: 'birthDate' } });
}

test('AI deadline aborts actual upstream fetch while waiting for headers or response body', async () => {
  for (const sendHeaders of [false, true]) {
    let upstreamClosed;
    const closed = new Promise(resolve => { upstreamClosed = resolve; });
    const upstream = http.createServer((req, res) => {
      req.resume();
      res.on('close', upstreamClosed);
      if (sendHeaders) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"success":');
      }
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    try {
      const handler = createExistingAIHandler({ timeoutMs: 80,
        fetchImpl: (_, options) => fetch('http://127.0.0.1:' + upstream.address().port, options) });
      const req = request(), res = response();
      await handler(req, res);
      await closed;
      assert.equal(res.body.fallback, true);
      assert.equal(req.listenerCount('aborted'), 0);
      assert.equal(res.listenerCount('close'), 0);
    } finally {
      upstream.closeAllConnections();
      await new Promise(resolve => upstream.close(resolve));
    }
  }
});

test('AI client disconnect cancels upstream and does not write a fallback to closed response', async () => {
  const req = request(), res = response();
  let signal, started;
  const ready = new Promise(resolve => { started = resolve; });
  const handler = createExistingAIHandler({ fetchImpl: async (_, options) => {
    signal = options.signal;
    started();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const pending = handler(req, res);
  await ready;
  res.destroyed = true;
  res.emit('close');
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(res.body, undefined);
  assert.equal(req.listenerCount('aborted'), 0);
  assert.equal(res.listenerCount('close'), 0);
});

test('AI forwarding pins backend, drops private and IP headers, preserves no-store/status', async () => {
  let call;
  const handler = createExistingAIHandler({ fetchImpl: async (...args) => {
    call = args;
    return new Response(JSON.stringify({ success: false, fallback: true }), { status: 429, headers: { 'content-type': 'application/json', 'set-cookie': 'private' } });
  } });
  const res = response(); await handler(request(), res);
  assert.equal(call[0], 'https://numerology-forum-landing.vercel.app/api/ai-interpretation');
  assert.equal(call[1].redirect, 'error');
  assert.ok(call[1].signal instanceof AbortSignal);
  assert.deepEqual(Object.keys(call[1].headers).sort(), ['Content-Type', 'Origin', 'X-Requested-With']);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['set-cookie'], undefined);
});
test('AI method/origin and oversized body are rejected before backend contact', async () => {
  const handler = createExistingAIHandler({ fetchImpl: async () => { throw new Error('Unexpected backend contact'); } });
  let req = request(), res = response(); req.method = 'GET';
  await handler(req, res); assert.equal(res.statusCode, 405);
  req = request(); res = response(); req.headers.origin = 'https://untrusted.example';
  await handler(req, res); assert.equal(res.statusCode, 403);
  req = request(); res = response(); req.body = 'x'.repeat(2049);
  await handler(req, res); assert.equal(res.statusCode, 413);
});
test('AI unavailable, non-JSON, malformed and excessive responses use existing local fallback contract', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('timeout'); },
    async () => new Response('<html>challenge</html>', { status: 403 }),
    async () => new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    async () => new Response(JSON.stringify({ text: 'x'.repeat(65536) }), { headers: { 'content-type': 'application/json' } })
  ]) {
    const res = response(); await createExistingAIHandler({ fetchImpl })(request(), res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.fallback, true);
  }
});
test('production switch routes AI aliases only and keeps unrelated APIs local', async () => {
  const realFetch = global.fetch;
  const prior = process.env.SITE_AI_USE_EXISTING_BACKEND;
  let contacts = 0;
  global.fetch = async (url) => {
    assert.equal(url, 'https://numerology-forum-landing.vercel.app/api/ai-interpretation');
    contacts++;
    return new Response(JSON.stringify({ success: false, error: 'invalid_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
  };
  process.env.SITE_AI_USE_EXISTING_BACKEND = 'true';
  const server = createServer();
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    for (const suffix of ['', '.js', '/']) {
      const res = await realFetch(base + '/api/ai-interpretation' + suffix, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://tsiframir.ru' }, body: '{}'
      });
      assert.equal(res.status, 400);
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
    assert.equal((await realFetch(base + '/api/events')).status, 200);
    assert.equal(contacts, 3);
  } finally {
    await new Promise(resolve => server.close(resolve));
    global.fetch = realFetch;
    if (prior === undefined) delete process.env.SITE_AI_USE_EXISTING_BACKEND;
    else process.env.SITE_AI_USE_EXISTING_BACKEND = prior;
  }
});
