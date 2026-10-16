'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EVENT_ID, quote, validateRegistration } = require('../api/lib/seminar-policy');
const { prepareInvoice, invoiceStatus, statusToken } = require('../api/lib/seminar-paykeeper-api');
const { render } = require('../api/lib/seminar-render');
const { createHandler } = require('../api/seminar-checkout')._test;
const now = Date.parse('2026-10-16T12:00:00+03:00');
const valid = { eventId: EVENT_ID, name: '  Анна Тестовая  ', phone: ' +7 (000) 000-00-00 ', email: ' test@example.invalid ', consent: true, expectedAmount: 1600 };
const config = { serverUrl: 'tsiframir.server.paykeeper.ru', secret: 'test-only-secret', apiLogin: 'test', apiPassword: 'test', providerTimeZone: 'Europe/Moscow' };
const json = value => ({ ok: true, json: async () => value });

test('registration accepts optional code word, trims metadata and never changes price', () => {
  for (const codeWord of [undefined, '', '   ', '  ЦифраМир  ', 'Осень 2026']) {
    const result = validateRegistration({ ...valid, codeWord }, now);
    assert.equal(result.ok, true);
    assert.equal(result.codeWord, codeWord?.trim() || '');
    assert.deepEqual(result.contact, { name: 'Анна Тестовая', phone: '+7 (000) 000-00-00', email: 'test@example.invalid' });
    assert.equal(result.quote.amount, 1600);
  }
});

test('server returns precise errors for every invalid field, including omitted required contacts', () => {
  for (const [field, values] of Object.entries({
    name: [undefined, '', ' ', 'А', '<script>', 'a'.repeat(101), 10],
    phone: [undefined, '', ' ', '123', '+7 123', '1234567890123456', 'abcdefghij', '+7 (000) 000\n00-00', 70000000000],
    email: [undefined, '', 'bad', 'a@b', 'a b@c.ru', '<x>@example.ru', 'a'.repeat(160)+'@b.ru'],
    codeWord: [null, 1, '<tag>', 'a'.repeat(101), 'one\ntwo'], consent: [undefined, false, 'true']
  })) for (const value of values) {
    const result = validateRegistration({ ...valid, [field]: value }, now);
    assert.equal(result.status, 400, `${field}: ${JSON.stringify(value)}`);
    assert.deepEqual(Object.keys(result.errors), [field]);
  }
});

test('invalid direct checkout never contacts provider and retains field error contract', async () => {
  let calls = 0;
  const handler = createHandler({ available: () => true, now: () => now, prepare: async () => { calls++; } });
  const response = { setHeader() {}, status(n) { this.code = n; return this; }, json(body) { this.body = body; } };
  await handler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { ...valid, name: '', phone: '', email: '' } }, response);
  assert.equal(response.code, 400); assert.equal(calls, 0);
  assert.deepEqual(Object.keys(response.body.errors), ['name', 'phone', 'email']);
});

for (const [time, amount, tariff] of [
  ['2026-10-25T23:59:59.999+03:00', 1600, 'EARLY'],
  ['2026-10-26T00:00:00.000+03:00', 1800, 'STANDARD'],
  ['2026-10-31T23:59:59.999+03:00', 1800, 'STANDARD'],
  ['2026-11-01T00:00:00.000+03:00', 3000, 'EVENT_DAY'],
  ['2026-11-01T14:59:59.999+03:00', 3000, 'EVENT_DAY'],
  ['2026-11-01T15:00:00.000+03:00', null, null]
]) test(`exact Moscow boundary, rendered quote and schema: ${time}`, t => {
  for (const [key, value] of Object.entries({ PAYKEEPER_SERVER_URL: config.serverUrl, PAYKEEPER_SECRET: config.secret,
    PAYKEEPER_API_LOGIN: 'test', PAYKEEPER_API_PASSWORD: 'test', PAYKEEPER_SEMINAR_ALLOW_STARTED_PAYMENT_COMPLETION: 'true' })) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const instant = Date.parse(time), q = quote(instant), html = render(instant);
  assert.equal(q.amount, amount); assert.equal(q.tariffCode, tariff);
  const embedded = JSON.parse(html.match(/<script type="application\/json" id="seminar-quote">(.*?)<\/script>/s)[1]);
  assert.equal(embedded.amount, amount);
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  if (amount !== null) {
    assert.match(html, new RegExp('data-current-price>' + amount + ' ₽'));
    assert.equal(Number(schema.offers.price), amount);
  } else assert.equal(schema.offers, undefined);
  assert.doesNotMatch(html, /(?:2000|2[ \u00a0]000)\s*₽/);
});

for (const [time, amount] of [
  ['2026-10-25T23:59:59+03:00', 1600],
  ['2026-10-26T00:00:00+03:00', 1800],
  ['2026-10-31T23:59:59+03:00', 1800],
  ['2026-11-01T00:00:00+03:00', 3000],
  ['2026-11-01T14:59:59+03:00', 3000]
]) test(`payment payload persists contacts and optional code word with authoritative amount at ${time}`, async () => {
  const instant = Date.parse(time);
  for (const codeWord of ['', '  Осень 2026  ']) {
    let payload;
    const result = await prepareInvoice({ ...valid, codeWord, expectedAmount: amount }, config, instant, {
      clock: () => instant, fetchImpl: async (url, options) => {
        if (!options.body) return json({ token: 'unit-test-token' });
        payload = Object.fromEntries(new URLSearchParams(options.body));
        return json({ invoice_id: '20261016000000001' });
      }
    });
    assert.equal(result.ok, true); assert.equal(result.amount, amount);
    assert.equal(payload.pay_amount, amount.toFixed(2));
    assert.equal(payload.clientid, 'Анна Тестовая');
    assert.equal(payload.client_phone, '+7 (000) 000-00-00');
    assert.equal(payload.client_email, 'test@example.invalid');
    const service = JSON.parse(payload.service_name), metadata = JSON.parse(service.custom_data);
    assert.equal(metadata.codeWord, codeWord.trim());
    assert.equal(metadata.eventId, EVENT_ID); assert.equal(metadata.quantity, 1);
    assert.equal(JSON.parse(service.cart)[0].sum, amount);
    assert.equal(JSON.parse(service.cart)[0].price, amount);
    assert.doesNotMatch(JSON.stringify(result), /Осень|Тестовая|example.invalid|000-00-00/);
  }
});

test('historical 2000 and new 3000 paid receipts retain the original amount and expiry', async () => {
  for (const amount of [2000, 3000]) {
    const claims = { v: 1, eventId: EVENT_ID, invoiceId: '20261101000000001', orderId: 'TSMNN-20261101-EVENT_DAY-11111111-1111-4111-a111-111111111111', amount, expiresAt: '2026-11-01T12:00:00.000Z' };
    const invoice = { id: claims.invoiceId, orderid: claims.orderId, pay_amount: amount.toFixed(2), expiry_datetime: '2026-11-01 15:00:00', status: 'paid', paymentid: '12345', paid_datetime: '2026-11-01 14:55:00' };
    const result = await invoiceStatus(statusToken(claims, config.secret), config, { fetchImpl: async () => json(invoice) });
    assert.equal(result.state, 'paid'); assert.equal(result.amount, amount); assert.equal(result.expiresAt, claims.expiresAt);
  }
});
