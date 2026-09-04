'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/forum-interest');

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function request(body, method = 'POST') {
  return { method, headers: { 'content-length': String(Buffer.byteLength(JSON.stringify(body))) }, body };
}

function validBody(overrides = {}) {
  return { email: 'reader@example.invalid', name: 'Читатель', consent: true, website: '', startedAt: Date.now() - 2000, ...overrides };
}

test('interest endpoint validates method, consent, timing and honeypot', async () => {
  let res = response();
  await handler(request({}, 'GET'), res);
  assert.equal(res.statusCode, 405);

  res = response();
  await handler(request(validBody({ consent: false })), res);
  assert.equal(res.statusCode, 400);

  res = response();
  await handler(request(validBody({ startedAt: Date.now() })), res);
  assert.equal(res.statusCode, 400);

  res = response();
  await handler(request(validBody({ website: 'spam.example' })), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true });
});

test('interest endpoint fails honestly when delivery is not configured', async () => {
  const previous = process.env.FORUM_INTEREST_WEBHOOK_URL;
  delete process.env.FORUM_INTEREST_WEBHOOK_URL;
  const res = response();
  await handler(request(validBody()), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error, 'delivery_not_configured');
  if (previous === undefined) delete process.env.FORUM_INTEREST_WEBHOOK_URL;
  else process.env.FORUM_INTEREST_WEBHOOK_URL = previous;
});

test('interest endpoint delivers validated data through server-only HTTPS configuration', async () => {
  const previousUrl = process.env.FORUM_INTEREST_WEBHOOK_URL;
  const previousFetch = global.fetch;
  process.env.FORUM_INTEREST_WEBHOOK_URL = 'https://leads.example.invalid/forum';
  let delivery;
  global.fetch = async (url, options) => {
    delivery = { url, options };
    return { ok: true };
  };
  try {
    const res = response();
    await handler(request(validBody()), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true });
    assert.equal(delivery.url, 'https://leads.example.invalid/forum');
    const payload = JSON.parse(delivery.options.body);
    assert.deepEqual(payload, {
      source: 'tsiframir.ru', topic: 'next_forum', email: 'reader@example.invalid', name: 'Читатель', consent: true
    });
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.FORUM_INTEREST_WEBHOOK_URL;
    else process.env.FORUM_INTEREST_WEBHOOK_URL = previousUrl;
  }
});
