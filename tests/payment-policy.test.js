'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { authorizeSale, getPublicEvents, parseOrderId } = require('../api/lib/event-policy');
const checkout = require('../api/paykeeper/checkout');
const config = require('../api/paykeeper/config');
const callback = require('../api/paykeeper/callback');

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('past forum and all historical tariffs are closed', () => {
  for (const code of ['STANDARD_SEMINAR', 'VIP_SEMINAR', 'POWER_PLACES', 'PACKAGE_STD_PLUS_POWER', 'PACKAGE_VIP_PLUS_POWER', 'SPEAKER_10', 'SPEAKER_15', 'SPEAKER_20', 'SPEAKER_30', 'STD', 'VIP', 'EXC']) {
    assert.deepEqual(authorizeSale('forum-2026-saint-petersburg', code, 1800).code, 'event_sales_closed');
  }
});

test('unknown event and malformed orders fail closed', () => {
  assert.equal(authorizeSale('not-an-event', 'VIP', 5000).code, 'unknown_event');
  assert.equal(parseOrderId('anything'), null);
});

test('only supported public event states leave the shared server model', () => {
  const events = getPublicEvents();
  assert.equal(events.some((event) => event.status === 'draft'), false);
  assert.deepEqual(events.map((event) => event.id), ['forum-2026-saint-petersburg']);
});

test('legacy orders map to the archived event', () => {
  assert.deepEqual(parseOrderId('TSIFRAMIR-VIP-20260613-abcdef'), {
    eventId: 'forum-2026-saint-petersburg', tariffCode: 'VIP'
  });
});

test('direct checkout request cannot create a past-event payment', async () => {
  const res = response();
  await checkout({ method: 'POST', body: { eventId: 'forum-2026-saint-petersburg', tariffCode: 'VIP_SEMINAR', amount: 5000 } }, res);
  assert.equal(res.statusCode, 410);
  assert.deepEqual(res.body, { ok: false, error: 'event_sales_closed' });
});

test('old browser config no longer discloses PayKeeper URL', async () => {
  const res = response();
  await config({ method: 'GET' }, res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.body.paymentAvailable, false);
  assert.equal('serverUrl' in res.body, false);
});

test('signed callback preserves acknowledgement for a known historical order', async () => {
  const previous = process.env.PAYKEEPER_SECRET;
  process.env.PAYKEEPER_SECRET = 'test-only-secret';
  const body = { id: '42', sum: '5000', clientid: 'test@example.invalid', orderid: 'TSIFRAMIR-VIP-20260613-abcdef' };
  body.key = crypto.createHash('md5').update(body.id + body.sum + body.clientid + body.orderid + process.env.PAYKEEPER_SECRET).digest('hex');
  const acknowledgement = 'OK ' + crypto.createHash('md5').update(body.id + process.env.PAYKEEPER_SECRET).digest('hex');
  const res = response();
  await callback({ method: 'POST', body }, res);
  if (previous === undefined) delete process.env.PAYKEEPER_SECRET; else process.env.PAYKEEPER_SECRET = previous;
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, acknowledgement);
});

test('signed callback rejects unknown tariffs and amount changes', async () => {
  const previous = process.env.PAYKEEPER_SECRET;
  process.env.PAYKEEPER_SECRET = 'test-only-secret';
  for (const values of [
    { sum: '1', orderid: 'TSIFRAMIR-VIP-20260613-abcdef' },
    { sum: '5000', orderid: 'TSIFRAMIR-NOT_A_TARIFF-20260613-abcdef' }
  ]) {
    const body = { id: '43', clientid: 'test@example.invalid', ...values };
    body.key = crypto.createHash('md5').update(body.id + body.sum + body.clientid + body.orderid + process.env.PAYKEEPER_SECRET).digest('hex');
    const res = response();
    await callback({ method: 'POST', body }, res);
    assert.notEqual(res.statusCode, 200);
  }
  if (previous === undefined) delete process.env.PAYKEEPER_SECRET; else process.env.PAYKEEPER_SECRET = previous;
});
