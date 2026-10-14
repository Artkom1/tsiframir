'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareInvoice, invoiceStatus, statusToken, readToken } = require('../api/lib/seminar-paykeeper-api');
const { EVENT_ID } = require('../api/lib/seminar-policy');
const config = { serverUrl: 'tsiframir.server.paykeeper.ru', secret: 'unit-test-secret-key',
  apiLogin: 'test-login', apiPassword: 'test-password', providerTimeZone: 'Europe/Moscow' };
const body = { eventId: EVENT_ID, name: 'Тестовый Участник', email: 'test@example.invalid', phone: '', consent: true, expectedAmount: 1600 };
const now = Date.parse('2026-10-25T23:55:00+03:00');
const claims = { v: 1, eventId: EVENT_ID, invoiceId: '20261013205736625',
  orderId: 'TSMNN-20261101-EARLY-11111111-1111-4111-a111-111111111111', amount: 1600, expiresAt: '2026-10-25T21:00:00.000Z' };
const invoice = { id: claims.invoiceId, orderid: claims.orderId, pay_amount: '1600.00', expiry_datetime: '2026-10-26 00:00:00',
  status: 'paid', paymentid: '12345', paid_datetime: '2026-10-25 23:56:00', client_email: body.email, clientid: body.name };
const json = value => ({ ok: true, json: async () => value });

test('payment gate stays closed unless explicit completion policy and every credential are present', () => {
  const { paymentAvailable } = require('../api/lib/seminar-runtime');
  const env = { PAYKEEPER_SERVER_URL: config.serverUrl, PAYKEEPER_SECRET: config.secret,
    PAYKEEPER_API_LOGIN: config.apiLogin, PAYKEEPER_API_PASSWORD: config.apiPassword };
  assert.equal(paymentAvailable(env), false);
  const enabled = { ...env, PAYKEEPER_SEMINAR_ALLOW_STARTED_PAYMENT_COMPLETION: 'true' };
  assert.equal(paymentAvailable(enabled), true);
  assert.equal(paymentAvailable({ ...enabled, PAYKEEPER_SEMINAR_ALLOW_STARTED_PAYMENT_COMPLETION: 'false' }), false);
  for (const key of Object.keys(env)) assert.equal(paymentAvailable({ ...enabled, [key]: '' }), false);
});

test('API creates durable invoice server-side; browser receives no contacts, cart, credentials or editable payment amount', async () => {
  const calls = [];
  const result = await prepareInvoice(body, config, now, { clock: () => now, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return json(calls.length === 1 ? { token: 'csrf-test' } : { invoice_id: claims.invoiceId, invoice_url: 'https://evil.invalid/' });
  } });
  assert.equal(result.ok, true); assert.equal(result.invoiceUrl, 'https://tsiframir.server.paykeeper.ru/bill/' + claims.invoiceId);
  assert.equal(result.amount, 1600); assert.equal(result.quantity, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'Basic ' + Buffer.from('test-login:test-password').toString('base64'));
  const form = Object.fromEntries(new URLSearchParams(calls[1].options.body));
  assert.equal(form.pay_amount, '1600.00'); assert.equal(form.expiry, '2026-10-26 00:00:00');
  assert.equal(form.client_email, body.email); assert.equal(form.orderid, result.orderId);
  const service = JSON.parse(form.service_name);
  assert.equal(JSON.parse(service.cart)[0].sum, 1600);
  assert.equal(JSON.parse(service.custom_data).eventId, EVENT_ID);
  assert.equal(service.user_result_callback, 'https://tsiframir.ru/forums/2026-nizhny-novgorod/#registration');
  assert.equal(readToken(result.statusToken, config.secret).invoiceId, claims.invoiceId);
  for (const privateValue of [body.email, body.name, config.apiPassword, config.apiLogin, config.secret, 'csrf-test']) assert.equal(JSON.stringify(result).includes(privateValue), false);
});

test('invoice API refuses amount/order/tariff injection and stale consent before contacting provider', async () => {
  const options = { clock: () => now, fetchImpl: () => { throw new Error('must not call'); } };
  for (const extra of [{ amount: 1 }, { orderId: claims.orderId }, { tariffCode: 'EARLY' }, { invoiceId: claims.invoiceId }]) {
    assert.equal((await prepareInvoice({ ...body, ...extra }, config, now, options)).status, 400);
  }
  assert.equal((await prepareInvoice({ ...body, expectedAmount: 1800 }, config, now, options)).status, 409);
  assert.equal((await prepareInvoice({ ...body, expectedAmount: 2000 }, config, Date.parse('2026-11-01T15:00:00+03:00'), options)).status, 410);
});

test('return preserves an approved checkout origin and cannot redirect elsewhere', async () => {
  let sent;
  await prepareInvoice(body, { ...config, returnOrigin: 'https://www.tsiframir.ru' }, now, {
    clock: () => now, fetchImpl: async (url, options) => {
      if (options.body) sent = JSON.parse(new URLSearchParams(options.body).get('service_name'));
      return json(options.body ? { invoice_id: claims.invoiceId } : { token: 'csrf' });
    }
  });
  assert.equal(sent.user_result_callback, 'https://www.tsiframir.ru/forums/2026-nizhny-novgorod/#registration');
  await assert.rejects(prepareInvoice(body, { ...config, returnOrigin: 'https://evil.invalid' }, now), /invalid_return_origin/);
});

test('invoice created too close to deadline is never handed out after expiry', async () => {
  let count = 0;
  const result = await prepareInvoice(body, config, now, { clock: () => Date.parse(claims.expiresAt),
    fetchImpl: async () => json(++count === 1 ? { token: 'csrf' } : { invoice_id: claims.invoiceId }) });
  assert.equal(result.status, 409); assert.equal(result.invoiceUrl, undefined);
});

test('receipt capability cannot be forged, enumerated, moved to another order or read without signature', async () => {
  const token = statusToken(claims, config.secret);
  assert.deepEqual(readToken(token, config.secret), claims);
  const changedSignature = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  for (const value of [claims.invoiceId, '', token + 'x', changedSignature, token.split('.')[0] + '.'.repeat(44)]) {
    assert.equal(readToken(value, config.secret), null);
  }
  assert.equal(readToken(token, 'another-test-secret'), null);
  const forged = Buffer.from(JSON.stringify({ ...claims, invoiceId: '20261013000000000' })).toString('base64url') + '.' + token.split('.')[1];
  const result = await invoiceStatus(forged, config, { fetchImpl: () => { throw new Error('no provider query for forged token'); } });
  assert.equal(result.status, 404);
});

test('paid status verifies durable provider invoice, id/amount/expiry and actual payment; never leaks contacts', async () => {
  const token = statusToken(claims, config.secret);
  const options = value => ({ fetchImpl: async () => json(value) });
  const result = await invoiceStatus(token, config, options(invoice));
  assert.equal(result.state, 'paid'); assert.equal(result.orderId, claims.orderId); assert.equal(result.quantity, 1);
  assert.match(result.confirmation.address, /Советская, 12/);
  assert.equal(result.confirmation.startDate, '2026-11-01T12:00:00+03:00');
  assert.equal(JSON.stringify(result).includes(body.email), false); assert.equal(JSON.stringify(result).includes(body.name), false);
  assert.deepEqual(await invoiceStatus(token, config, options([invoice])), result);
  // A repeated or late status fetch is idempotent; it does not create tickets/emails.
  assert.deepEqual(await invoiceStatus(token, config, options(invoice)), result);
  for (const change of [{ status: 'created' }, { status: 'sent' }, { paymentid: null }, { paid_datetime: null }]) {
    assert.equal((await invoiceStatus(token, config, options({ ...invoice, ...change }))).state, 'pending');
  }
  assert.equal((await invoiceStatus(token, config, options({ ...invoice, status: 'expired' }))).state, 'expired');
  for (const change of [{ id: '1' }, { orderid: 'forged' }, { pay_amount: '1.00' }, { expiry_datetime: '2099-01-01 00:00:00' }]) {
    await assert.rejects(invoiceStatus(token, config, options({ ...invoice, ...change })), /invoice_mismatch/);
  }
});

test('status endpoint is POST/no-store, rejects URL-paid and foreign origins, hides provider failures', async () => {
  const { createHandler } = require('../api/seminar-status')._test;
  const res = () => ({ headers: {}, code: 200, setHeader(k,v) { this.headers[k]=v; }, status(v) { this.code=v; return this; }, json(v) { this.body=v; return this; } });
  const req = { method: 'POST', headers: { origin: 'https://tsiframir.ru', 'content-type': 'application/json' }, body: { statusToken: statusToken(claims, config.secret) } };
  const handler = createHandler({ config: () => config, read: async () => { throw new Error('private-contact@example.invalid'); } });
  for (const [change, code] of [[{ method: 'GET' }, 405], [{ body: { paid: true } }, 400], [{ headers: { ...req.headers, origin: 'https://evil.invalid' } }, 403], [{}, 503]]) {
    const response = res(); await handler({ ...req, ...change }, response);
    assert.equal(response.code, code); assert.match(response.headers['Cache-Control'], /no-store/);
    assert.equal(JSON.stringify(response.body).includes('private-contact'), false);
  }
});
