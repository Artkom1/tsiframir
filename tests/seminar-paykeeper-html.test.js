'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareHtmlPayment, expiryInMerchantZone, signFields } = require('../api/lib/seminar-paykeeper-html');
const { EVENT_ID } = require('../api/lib/seminar-policy');
const config = { serverUrl: 'tsiframir.server.paykeeper.ru', secret: 'unit-test-secret', providerTimeZone: 'Europe/Moscow' };
const form = amount => ({ eventId: EVENT_ID, name: 'Тестовый Участник', email: 'test@example.invalid', phone: '+7 (000) 000-00-00', consent: true, expectedAmount: amount });

test('native PayKeeper signature includes expiry and every documented signed field', () => {
  const fields = { sum: '1600.00', clientid: 'Тест', orderid: 'TSMNN-123', service_name: 'Семинар', client_email: 'test@example.invalid', client_phone: '', expiry: '2026-10-26 00:00:00' };
  const signature = signFields(fields, config.secret);
  assert.equal(signature, 'cd0840a7ec795660d1fd33e096f111551f3c30b5dc460b11ce109a77d6a3ec2c');
  assert.match(signature, /^[a-f0-9]{64}$/);
  for (const key of Object.keys(fields)) assert.notEqual(signFields({ ...fields, [key]: fields[key] + 'x' }, config.secret), signature);
  assert.notEqual(signFields(fields, 'different-secret'), signature);
  assert.throws(() => signFields(fields, ''), /secret_missing/);
});

test('native payload uses server tariff, unique event order, fixed merchant and no secret or contacts in URL', () => {
  for (const [time, amount, expiry] of [
    ['2026-10-25T23:55:00+03:00', 1600, '2026-10-26 00:00:00'],
    ['2026-10-31T23:55:00+03:00', 1800, '2026-11-01 00:00:00'],
    ['2026-11-01T14:55:00+03:00', 3000, '2026-11-01 15:00:00']
  ]) {
    const result = prepareHtmlPayment(form(amount), config, Date.parse(time));
    assert.equal(result.ok, true); assert.equal(result.method, 'POST');
    assert.equal(result.action, 'https://tsiframir.server.paykeeper.ru/create/');
    assert.equal(result.amount, amount); assert.equal(result.fields.sum, amount.toFixed(2));
    assert.equal(result.fields.expiry, expiry); assert.equal(result.fields.client_email, form(amount).email);
    assert.equal(result.fields.sign, signFields(result.fields, config.secret));
    assert.match(result.orderId, /^TSMNN-20261101-[A-Z_]+-[a-f0-9-]{36}$/);
    assert.match(result.fields.service_name, /01\.11\.2026.*12:00–15:00.*Советская, 12.*1 участник/);
    assert.deepEqual(JSON.parse(result.fields.cart), [{ name: 'Участие в мастер-классе «Код богатства», 01.11.2026, 12:00–15:00 МСК, 1 человек', price: amount, quantity: 1, sum: amount, tax: 'none' }]);
    assert.equal(result.fields.client_phone, '+7 (000) 000-00-00'); assert.equal(result.fields.user_result_callback, undefined);
    assert.doesNotMatch(JSON.stringify(result), /unit-test-secret/);
    assert.notEqual(prepareHtmlPayment(form(amount), config, Date.parse(time)).orderId, result.orderId);
  }
});

test('native payload omits an empty email and signs the absent field consistently', () => {
  const result = prepareHtmlPayment({ ...form(1600), email: '' }, config, Date.parse('2026-10-25T12:00:00+03:00'));
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.fields, 'client_email'), false);
  assert.equal(result.fields.sign, signFields({ ...result.fields, client_email: '' }, config.secret));
});

test('native builder refuses stale consent, client order/amount changes, closed sales and another merchant', () => {
  const now = Date.parse('2026-10-26T00:00:00+03:00');
  assert.equal(prepareHtmlPayment(form(1600), config, now).status, 409);
  for (const extra of [{ sum: 1 }, { amount: 1 }, { expiry: '2099-01-01' }, { orderid: 'forged' }, { tariffCode: 'EARLY' }, { cart: '[]' }]) {
    assert.equal(prepareHtmlPayment({ ...form(1800), ...extra }, config, now).status, 400);
  }
  assert.equal(prepareHtmlPayment(form(3000), config, Date.parse('2026-11-01T15:00:00+03:00')).status, 410);
  for (const serverUrl of ['example.paykeeper.ru', 'http://tsiframir.server.paykeeper.ru', 'https://tsiframir.server.paykeeper.ru@evil.invalid', 'https://tsiframir.server.paykeeper.ru/create/', 'https://tsiframir.server.paykeeper.ru/?x=1']) {
    assert.throws(() => prepareHtmlPayment(form(1800), { ...config, serverUrl }, now));
  }
});

test('required phone is bounded, validated and covered by the provider signature', () => {
  const now = Date.parse('2026-10-25T12:00:00+03:00');
  const result = prepareHtmlPayment({ ...form(1600), phone: ' +0 (000) 000-00-00 ' }, config, now);
  assert.equal(result.fields.client_phone, '+0 (000) 000-00-00');
  assert.equal(result.fields.sign, signFields(result.fields, config.secret));
  assert.notEqual(result.fields.sign, signFields({ ...result.fields, client_phone: '' }, config.secret));
  for (const phone of [null, 123, 'x', '+', '1'.repeat(21), '<script>', '123\n456']) {
    assert.equal(prepareHtmlPayment({ ...form(1600), phone }, config, now).status, 400);
  }
  assert.equal(prepareHtmlPayment({ ...form(1600), phone: '' }, config, now).status, 400);
});

test('merchant expiry requires an explicit account zone, independent of event and runtime zones', () => {
  assert.equal(expiryInMerchantZone('2026-10-25T21:00:00Z', 'Europe/Moscow'), '2026-10-26 00:00:00');
  assert.equal(expiryInMerchantZone('2026-10-25T21:00:00Z', 'UTC'), '2026-10-25 21:00:00');
  assert.throws(() => expiryInMerchantZone('2026-10-25T21:00:00Z'), /timezone_unverified/);
  assert.throws(() => expiryInMerchantZone('2026-10-25T21:00:00Z', 'Invalid/Zone'));
});

test('checkout uses injected provider only through verified runtime and hides configuration errors', async () => {
  const { createHandler } = require('../api/seminar-checkout')._test;
  const response = () => ({ statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; return this; } });
  const req = { method: 'POST', headers: { origin: 'https://tsiframir.ru', 'content-type': 'application/json' }, body: form(1600) };
  const now = () => Date.parse('2026-10-25T23:55:00+03:00');
  const allowed = createHandler({ available: () => true, config: () => config, now, prepare: prepareHtmlPayment });
  const ok = response(); await allowed(req, ok);
  assert.equal(ok.statusCode, 200); assert.equal(ok.body.fields.expiry, '2026-10-26 00:00:00');
  assert.equal(ok.body.fields.sign, signFields(ok.body.fields, config.secret)); assert.match(ok.headers['Cache-Control'], /no-store/);
  const closed = createHandler({ available: () => false, config: () => { throw new Error('must_not_read_config'); }, now });
  const blocked = response(); await closed(req, blocked); assert.equal(blocked.statusCode, 503);
  const broken = createHandler({ available: () => true, config: () => ({ ...config, providerTimeZone: null }), now, prepare: prepareHtmlPayment });
  const failed = response(); await broken(req, failed); assert.equal(failed.statusCode, 503);
  for (const result of [blocked, failed]) assert.deepEqual(result.body, { ok: false, error: 'payment_temporarily_unavailable' });
  const stale = response(); await allowed({ ...req, body: form(1800) }, stale); assert.equal(stale.statusCode, 409);
});
