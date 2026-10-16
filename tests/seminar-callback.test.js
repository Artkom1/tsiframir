'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const callback = require('../api/paykeeper/callback');
const secret = 'callback-test-only';
const uuid = 'c1507987-828b-4f6a-9560-b6e2d72c26db';
const md5 = value => crypto.createHash('md5').update(value, 'utf8').digest('hex');
const signed = (overrides = {}) => {
  const body = { id: '1234', sum: '1600.00', clientid: 'Тестовый Участник', orderid: `TSMNN-20261101-EARLY-${uuid}`, ...overrides };
  return { ...body, key: md5(body.id + body.sum + body.clientid + body.orderid + secret) };
};
async function invoke(body) {
  const previous = process.env.PAYKEEPER_SECRET;
  process.env.PAYKEEPER_SECRET = secret;
  const res = { headers: {}, code: 200, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; } };
  try { await callback({ method: 'POST', body }, res); return res; }
  finally { if (previous === undefined) delete process.env.PAYKEEPER_SECRET; else process.env.PAYKEEPER_SECRET = previous; }
}

test('native notification ACK is repeatable for all tariffs without issuing local confirmation', async () => {
  for (const [code, amount] of [['EARLY', '1600.00'], ['STANDARD', '1800.00'], ['EVENT_DAY', '3000.00'], ['EVENT_DAY', '2000.00']]) {
    const body = signed({ sum: amount, orderid: `TSMNN-20261101-${code}-${uuid}` });
    for (let retry = 0; retry < 2; retry++) {
      const res = await invoke(body);
      assert.equal(res.code, 200); assert.equal(res.body, 'OK ' + md5(body.id + secret));
      assert.equal(res.headers['Cache-Control'], 'no-store');
      assert.doesNotMatch(res.body, /paid|ticket|Участник/);
    }
  }
});

test('native notification rejects signature, amount, namespace and malformed field substitutions', async () => {
  const badSignature = await invoke({ ...signed(), key: '0'.repeat(32) }); assert.equal(badSignature.code, 403);
  for (const overrides of [
    { sum: '1.00' }, { sum: '1.6e3' }, { sum: ['1600.00'] }, { id: '1'.repeat(21) },
    { clientid: { name: 'test' } }, { clientid: '<script>' },
    { orderid: `TSMNN-20261101-VIP-${uuid}` }, { orderid: 'TSMNN-20261101-EARLY-forged' },
    { orderid: `TSMNN-20261102-EARLY-${uuid}` }
  ]) assert.notEqual((await invoke(signed(overrides))).code, 200);
});

test('native late delivery uses authenticated tariff without rejecting on delivery date', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-11-03T12:00:00+03:00');
  try { assert.equal((await invoke(signed())).code, 200); }
  finally { Date.now = originalNow; }
  // ACK asserts receipt only. Provider ledger/settlement time/expiry must be
  // verified separately; neither a URL parameter nor this response issues a ticket.
});
