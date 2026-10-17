'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readOrders, filterOrders, csv, metadata } = require('../api/lib/seminar-registry');
const { prepareInvoice, invoiceStatus } = require('../api/lib/seminar-paykeeper-api');
const { createHandler } = require('../api/seminar-organizer')._test;
const callback = require('../api/paykeeper/callback');
const { EVENT_ID } = require('../api/lib/seminar-policy');
const config = { serverUrl: 'tsiframir.server.paykeeper.ru', secret: 'synthetic-registry-secret', apiLogin: 'organizer-test', apiPassword: 'synthetic-test-password', providerTimeZone: 'Europe/Moscow' };
const auth = 'Basic ' + Buffer.from(config.apiLogin + ':' + config.apiPassword).toString('base64');
const now = Date.parse('2026-10-17T12:00:00+03:00');
const valid = { eventId: EVENT_ID, name: 'Тестовый участник', email: 'registry@example.invalid', phone: '+7 (000) 000-00-00', consent: true, expectedAmount: 1600 };
const result = data => ({ ok: true, json: async () => structuredClone(data) });
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; } });
function provider() {
  const invoices = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, auth);
    if (path === '/info/settings/token/') return result({ token: 'synthetic-token' });
    if (path === '/change/invoice/preview/') {
      const body = Object.fromEntries(new URLSearchParams(options.body));
      const service = JSON.parse(body.service_name);
      const id = '2026101700000000' + (invoices.length + 1);
      invoices.push({ id, orderid: body.orderid, clientid: body.clientid, client_phone: body.client_phone, client_email: body.client_email,
        service_name: service.service_name + ';PKC|' + service.cart + ';PKURC|' + service.user_result_callback + ';PKDC|' + service.custom_data + '|',
        status: 'created', created_datetime: '2026-10-17 12:00:00', expiry_datetime: body.expiry, paid_datetime: null, paymentid: null, pay_amount: body.pay_amount });
      return result({ invoice_id: id });
    }
    if (path === '/info/invoice/search/') {
      assert.equal(new URL(url).searchParams.get('query'), 'TSMNN-20261101-*');
      return result(invoices);
    }
    if (path === '/info/invoice/byid/') return result(invoices.find(x => x.id === new URL(url).searchParams.get('id')));
    assert.fail('unexpected provider endpoint');
  };
  return { invoices, fetchImpl };
}

test('provider invoice lifecycle preserves exact attribution before/after payment, reload and repeated callbacks; same email stays separate', async t => {
  const p = provider();
  const codeWord = '  МиРA-а;PKDC|"=1  ';
  const first = await prepareInvoice({ ...valid, codeWord }, config, now, { fetchImpl: p.fetchImpl, clock: () => now });
  assert.equal(first.ok, true);
  let rows = await readOrders(config, p);
  assert.equal(rows.length, 1); assert.equal(rows[0].codeWord, codeWord); assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].createdAt, '2026-10-17T12:00:00+03:00');
  assert.equal(rows[0].phone, valid.phone); assert.equal(rows[0].email, valid.email);
  p.invoices[0].status = 'paid'; p.invoices[0].paymentid = '90001'; p.invoices[0].paid_datetime = '2026-10-17 12:03:00';
  const old = process.env.PAYKEEPER_SECRET; process.env.PAYKEEPER_SECRET = config.secret;
  t.after(() => { if (old === undefined) delete process.env.PAYKEEPER_SECRET; else process.env.PAYKEEPER_SECRET = old; });
  const body = { id: '90001', sum: '1600.00', clientid: valid.name, orderid: first.orderId };
  body.key = crypto.createHash('md5').update(body.id + body.sum + body.clientid + body.orderid + config.secret).digest('hex');
  for (let i = 0; i < 3; i++) { const res = response(); await callback({ method: 'POST', body }, res); assert.equal(res.code, 200); }
  const second = await prepareInvoice({ ...valid, codeWord: '' }, config, now, { fetchImpl: p.fetchImpl, clock: () => now });
  assert.notEqual(first.orderId, second.orderId);
  // Reload the registry module and read the durable provider again.
  delete require.cache[require.resolve('../api/lib/seminar-registry')];
  rows = await require('../api/lib/seminar-registry').readOrders(config, { fetchImpl: p.fetchImpl });
  assert.equal(rows.length, 2);
  const paid = rows.find(x => x.orderId === first.orderId);
  assert.equal(paid.status, 'paid'); assert.equal(paid.codeWord, codeWord); assert.equal(paid.paymentId, '90001');
  assert.equal(rows.find(x => x.orderId === second.orderId).codeWord, '');
  assert.equal((await invoiceStatus(first.statusToken, config, p)).state, 'paid');
  assert.equal(filterOrders(rows, { paid: true }).length, 1);
  assert.equal(filterOrders(rows, { code: '  мирA-А  ' })[0].orderId, first.orderId);
  assert.equal(filterOrders(rows, { code: 'мирА-а' }).length, 0, 'Latin A never replaced with Cyrillic А');
  assert.equal(filterOrders(rows, { codeState: 'without' })[0].orderId, second.orderId);
  assert.equal(filterOrders(rows, { codeState: 'with' })[0].orderId, first.orderId);
  assert.equal(p.invoices.length, 2);
});

test('registration without email stays distinct and appears in protected organizer HTML and CSV', async () => {
  const p = provider();
  const first = await prepareInvoice({ ...valid, email: '', codeWord: '  Без email  ' }, config, now, { fetchImpl: p.fetchImpl, clock: () => now });
  const second = await prepareInvoice({ ...valid, email: undefined }, config, now, { fetchImpl: p.fetchImpl, clock: () => now });
  assert.equal(first.ok, true); assert.equal(second.ok, true); assert.notEqual(first.orderId, second.orderId);
  const rows = await readOrders(config, p);
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.email === '' && row.phone === valid.phone));
  assert.equal(rows.find(row => row.orderId === first.orderId).codeWord, '  Без email  ');
  const handler = createHandler({ config: () => config, read: () => readOrders(config, p) });
  const headers = { authorization: auth, 'content-type': 'application/x-www-form-urlencoded', origin: 'https://tsiframir.ru' };
  const view = response(); await handler({ method: 'GET', headers }, view);
  assert.equal(view.code, 200); assert.ok(view.body.includes(first.orderId)); assert.ok(view.body.includes(second.orderId));
  assert.doesNotMatch(view.body, /undefined|null/);
  const exported = response(); await handler({ method: 'POST', headers, body: { action: 'csv' } }, exported);
  assert.equal(exported.code, 200); assert.ok(exported.body.includes(first.orderId)); assert.ok(exported.body.includes(second.orderId));
  assert.ok(exported.body.includes(';"";"  Без email  ";'));
  assert.equal((await invoiceStatus(first.statusToken, config, p)).state, 'pending');
});

test('metadata reader accepts actual PKDC and legacy JSON while preserving punctuation; fails closed on damage', () => {
  const data = { eventId: EVENT_ID, codeWord: ' X;PKDC|Y | ' };
  assert.deepEqual(metadata('service;PKC|[];PKDC|' + JSON.stringify(data) + '|'), data);
  assert.deepEqual(metadata(JSON.stringify({ custom_data: JSON.stringify(data) })), data);
  assert.equal(metadata('service;PKDC|' + JSON.stringify({ eventId: EVENT_ID }) + '|').codeWord, undefined);
  assert.throws(() => metadata('broken'));
  assert.throws(() => metadata('service;PKDC|{"eventId":"other"}|'));
});

test('provider registry excludes foreign orders and rejects contradictory duplicate identity', async () => {
  const p = provider(); await prepareInvoice(valid, config, now, { fetchImpl: p.fetchImpl, clock: () => now });
  p.invoices.push({ orderid: 'FOREIGN', client_email: 'private@example.invalid' });
  assert.equal((await readOrders(config, p)).length, 1);
  p.invoices.push(structuredClone(p.invoices[0]));
  assert.equal((await readOrders(config, p)).length, 1);
  p.invoices.at(-1).client_email = 'other@example.invalid';
  await assert.rejects(readOrders(config, p), /duplicate_order_identity/);
});

test('CSV includes every field, UTF-8 BOM, quotes and formula-safe exact-value representation', () => {
  const p = csv([{ eventId: EVENT_ID, orderId: 'order', name: '=1+1', phone: '+70000000000', email: 'a@example.invalid', codeWord: '  @SUM("x;y")', createdAt: '2026-10-17T12:00:00+03:00', amount: 1600, status: 'paid', currency: 'RUB', paymentId: '90001', paidAt: '2026-10-17T12:03:00+03:00', quantity: 1, tariff: 'EARLY', expiresAt: '2026-10-17T12:15:00+03:00' }]);
  assert.ok(p.startsWith('\uFEFF')); assert.match(p, /Промокод \/ кодовое слово/);
  assert.ok(p.includes('"\'=1+1"')); assert.ok(p.includes('"\'+70000000000"'));
  assert.ok(p.includes('"\'  @SUM(""x;y"")"')); assert.match(p, /Оплачен/);
  assert.equal(p.split('\r\n').length, 3);
  assert.doesNotMatch(p, /statusToken|invoiceUrl|Basic /);
});

test('both registry and export deny unauthenticated/wrong credentials before any provider read, with no-store and throttle', async () => {
  let reads = 0;
  let clock = now;
  const handler = createHandler({ config: () => config, read: async () => { reads++; return []; }, now: () => clock });
  for (let i = 0; i < 12; i++) {
    const res = response();
    await handler({ method: i % 2 ? 'POST' : 'GET', headers: { authorization: 'Basic ' + Buffer.from('wrong:wrong').toString('base64') }, body: { action: 'csv' } }, res);
    assert.equal(res.code, i < 10 ? 401 : 429); assert.match(res.headers['cache-control'], /no-store/);
    assert.doesNotMatch(res.body, /synthetic|registry@example/);
  }
  assert.equal(reads, 0);
  const blocked = response(); await handler({ method: 'GET', headers: { authorization: auth } }, blocked);
  assert.equal(blocked.code, 429); assert.equal(reads, 0);
  clock += 60_001;
  const success = response(); await handler({ method: 'GET', headers: { authorization: auth } }, success);
  assert.equal(success.code, 200); assert.equal(reads, 1);
});

test('authorized HTML and filtered export escape content, reject cross-site/invalid requests and keep errors private', async () => {
  const rows = [{ eventId: EVENT_ID, orderId: 'one', codeWord: '  <img src=x onerror=alert(1)>  ', name: '<b>name</b>', email: 'synthetic@example.invalid', status: 'paid', amount: 1600 }, { orderId: 'two', codeWord: '', status: 'pending' }];
  const handler = createHandler({ config: () => config, read: async () => rows });
  const headers = { authorization: auth, 'content-type': 'application/x-www-form-urlencoded', origin: 'https://tsiframir.ru' };
  const view = response(); await handler({ method: 'GET', headers }, view);
  assert.equal(view.code, 200); assert.ok(view.body.includes('&lt;img')); assert.ok(!view.body.includes('<img'));
  assert.match(view.headers['content-security-policy'], /frame-ancestors 'none'/);
  const exported = response(); await handler({ method: 'POST', headers, body: { action: 'csv', code: 'IMG', paid: '1' } }, exported);
  assert.equal(exported.code, 200); assert.match(exported.headers['content-type'], /text\/csv/);
  assert.match(exported.body, /"one"/); assert.doesNotMatch(exported.body, /"two"/);
  for (const [req, expected] of [
    [{ method: 'POST', headers: { ...headers, origin: 'https://evil.invalid' }, body: {} }, 403],
    [{ method: 'GET', headers: { ...headers, 'sec-fetch-site': 'cross-site' } }, 403],
    [{ method: 'POST', headers, body: { code: 'x'.repeat(101) } }, 400],
    [{ method: 'POST', headers, body: { codeState: 'other' } }, 400],
    [{ method: 'DELETE', headers }, 405]
  ]) { const res = response(); await handler(req, res); assert.equal(res.code, expected); }
  const fail = createHandler({ config: () => config, read: async () => { throw new Error('secret contact token'); } });
  const res = response(); await fail({ method: 'GET', headers }, res); assert.equal(res.code, 503); assert.doesNotMatch(res.body, /secret|contact|token/);
});
