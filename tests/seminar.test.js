'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { EVENT, EVENT_ID, quote, validateRegistration } = require('../api/lib/seminar-policy');
const { createOrderService } = require('../api/lib/seminar-orders');
const { render } = require('../api/lib/seminar-render');
const checkout = require('../api/seminar-checkout');
const quoteEndpoint = require('../api/seminar-quote');
const { authorizeSale, parseOrderId } = require('../api/lib/event-policy');
const ms = value => Date.parse(value);
const form = amount => ({ eventId: EVENT_ID, name: 'Тестовый Участник', email: 'test@example.invalid', consent: true, expectedAmount: amount });
const response = () => ({ headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } });

test('masterclass schedule is contiguous for exactly 180 minutes including the break', () => {
  const minutes = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  let cursor = 12 * 60, total = 0;
  for (const item of EVENT.schedule.flatMap(day => day.items)) {
    const [start, end] = item.time.split('–').map(minutes);
    assert.equal(start, cursor, 'no gaps or overlaps');
    assert.ok(end > start); total += end - start; cursor = end;
  }
  assert.equal(cursor, 15 * 60); assert.equal(total, 180);
  assert.equal(ms(EVENT.endDate) - ms(EVENT.startDate), 180 * 60_000);
  assert.equal(EVENT.salesClose, EVENT.endDate);
  assert.equal(EVENT.tariffs.at(-1).validUntil, EVENT.salesClose);
  assert.equal(EVENT_ID, 'seminar-2026-nizhny-novgorod');
});

test('rendered event metadata, contacts and receipt description agree with the revised meeting', () => {
  const html = render(ms('2026-10-14T12:00:00+03:00'));
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema.endDate, '2026-11-01T15:00:00+03:00');
  assert.deepEqual(schema.organizer.telephone, ['+79202997772', '+79087305573']);
  assert.match(schema.name, /Код богатства/);
  assert.match(html, /12:00–15:00/); assert.match(html, /в 15:00/);
  assert.doesNotMatch(html, /18:00|79165127377|Шесть часов|fonts\.googleapis|telesco\.pe/);
  assert.match(html, /tel:\+79202997772/); assert.match(html, /tel:\+79087305573/);
});

for (const [time, amount, status] of [
  ['2026-10-25T23:59:59+03:00', 1600, 'upcoming'], ['2026-10-26T00:00:00+03:00', 1800, 'upcoming'],
  ['2026-10-31T23:59:59+03:00', 1800, 'upcoming'], ['2026-11-01T00:00:00+03:00', 2000, 'upcoming'],
  ['2026-11-01T12:00:00+03:00', 2000, 'live'], ['2026-11-01T14:59:59+03:00', 2000, 'live'],
  ['2026-11-01T15:00:00+03:00', null, 'past']
]) test(`server tariff ${time} → ${amount}, ${status}`, () => {
  const result = quote(ms(time));
  assert.equal(result.amount, amount); assert.equal(result.status, status); assert.equal(result.salesOpen, amount !== null);
});

test('invoice deadline is the earliest of 15 minutes, tariff boundary and closure', () => {
  assert.equal(quote(ms('2026-10-13T12:00:00.987+03:00')).expiresAt, '2026-10-13T09:15:00.000Z');
  for (const [time, end] of [
    ['2026-10-13T12:00:00+03:00', '2026-10-13T12:15:00+03:00'],
    ['2026-10-25T23:55:00+03:00', '2026-10-26T00:00:00+03:00'],
    ['2026-10-31T23:55:00+03:00', '2026-11-01T00:00:00+03:00'],
    ['2026-11-01T14:55:00+03:00', '2026-11-01T15:00:00+03:00']
  ]) assert.equal(ms(quote(ms(time)).expiresAt), ms(end));
});

test('next server transition includes noon lifecycle independently of tariff expiry', () => {
  assert.equal(quote(ms('2026-11-01T11:59:59+03:00')).nextTransitionAt, '2026-11-01T09:00:00.000Z');
  assert.equal(quote(ms('2026-11-01T12:00:00+03:00')).nextTransitionAt, '2026-11-01T12:00:00.000Z');
  assert.equal(quote(ms('2026-11-01T15:00:00+03:00')).nextTransitionAt, null);
});

test('runtime time zone never changes server tariff or expiry', () => {
  const script = "console.log(JSON.stringify(require('./api/lib/seminar-policy').quote(Date.parse('2026-10-26T00:00:00+03:00'))))";
  const values = ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo'].map(TZ => execFileSync(process.execPath, ['-e', script], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, TZ }, encoding: 'utf8' }));
  assert.equal(values[0], values[1]); assert.equal(values[1], values[2]);
});

test('stale consent, arbitrary amount/tariff/order and invalid forms are rejected before provider', () => {
  const now = ms('2026-10-26T00:00:00+03:00');
  assert.equal(validateRegistration(form(1600), now).status, 409);
  for (const extra of [{ amount: 1 }, { tariffCode: 'EARLY' }, { orderId: 'forged' }, { quantity: 2 }, { serverTime: '2026-01-01' }]) {
    assert.equal(validateRegistration({ ...form(1800), ...extra }, now).status, 400);
  }
  for (const extra of [{ name: '' }, { email: 'bad' }, { consent: false }, { name: '<script>' }]) assert.equal(validateRegistration({ ...form(1800), ...extra }, now).status, 400);
  assert.equal(validateRegistration(form(2000), ms(EVENT.salesClose)).status, 410);
  assert.equal(authorizeSale(EVENT_ID, 'EARLY', 1600).code, 'use_event_checkout');
  assert.equal(parseOrderId('TSMNN-forged-order'), null);
});

test('production checkout fails closed without collecting contacts, and quote cannot be cached', async () => {
  const res = response(); quoteEndpoint({ method: 'GET' }, res);
  assert.equal(res.body.paymentAvailable, false); assert.match(res.headers['Cache-Control'], /no-store/);
  const out = response();
  await checkout({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://tsiframir.ru' }, body: form(quote().amount) }, out);
  assert.equal(out.statusCode, quote().salesOpen ? 503 : 410);
  assert.doesNotMatch(JSON.stringify(out.body), /test@example|Тестовый/);
  const cross = response(); await checkout({ method: 'POST', headers: { origin: 'https://example.invalid' }, body: form(1600) }, cross); assert.equal(cross.statusCode, 403);
  const get = response(); await checkout({ method: 'GET' }, get); assert.equal(get.statusCode, 405);
});

function fixture(start = '2026-10-25T23:55:00+03:00') {
  let time = ms(start), settlements = 0, providerCalls = 0;
  const orders = new Map(); const payments = new Map(); const usedPayments = new Map();
  // TEST DOUBLE ONLY. Production never imports or uses this memory repository.
  const repository = {
    durable: true,
    async create(order) { assert.equal(orders.has(order.id), false); orders.set(order.id, structuredClone(order)); },
    async attachInvoice(id, fields) { Object.assign(orders.get(id), fields); },
    async fail(id, reason) { Object.assign(orders.get(id), { status: 'failed', reason }); },
    async get(id) { return orders.get(id) || null; },
    async settleOnce(id, payment) {
      const order = orders.get(id);
      if (usedPayments.has(payment.paymentId) && usedPayments.get(payment.paymentId) !== id) throw new Error('duplicate_payment');
      if (order.status === 'paid') return;
      usedPayments.set(payment.paymentId, id); settlements++; Object.assign(order, payment, { status: 'paid' });
    }
  };
  const provider = {
    origin: 'https://example.paykeeper.ru', expiryEnforced: true,
    async createInvoice(order) {
      assert.ok(orders.has(order.id), 'order must be committed before provider'); providerCalls++;
      return { id: String(providerCalls), url: `https://example.paykeeper.ru/bill/${providerCalls}`, expiresAt: order.expiresAt };
    },
    async getPayment(id) { return payments.get(id); },
    pay(order, at, status = 'paid') {
      // Models a verified provider guarantee; NOT evidence of PayKeeper sandbox.
      if (ms(at) >= ms(order.expiresAt)) return false;
      payments.set('42', { id: '42', orderId: order.id, invoiceId: order.invoiceId, amount: order.amount, paidAt: at, status }); return true;
    }
  };
  const secret = 'local-test-only';
  const service = createOrderService({ repository, provider, secret, now: () => time });
  const callback = order => {
    const body = { id: '42', sum: String(order.amount), clientid: order.contact.name, orderid: order.id };
    body.key = crypto.createHash('md5').update(body.id + body.sum + body.clientid + body.orderid + secret).digest('hex'); return body;
  };
  return { service, repository, provider, orders, payments, callback, setTime: value => { time = ms(value); }, get settlements() { return settlements; }, get providerCalls() { return providerCalls; } };
}

test('order contract requires durable storage and an independently verified provider expiry', () => {
  assert.throws(() => createOrderService({ repository: { durable: false }, provider: { expiryEnforced: true }, secret: 'test' }));
  assert.throws(() => createOrderService({ repository: { durable: true }, provider: { expiryEnforced: false }, secret: 'test' }));
});

test('mock lifecycle: signed payment, late delivery, replay, one confirmation with safe access token', async () => {
  const f = fixture(); const result = await f.service.checkout(form(1600)); const order = f.orders.get(result.orderId);
  assert.equal(result.ok, true); assert.equal(f.providerCalls, 1);
  assert.equal((await f.service.confirmation(order.id, result.accessToken)).status, 'pending');
  assert.equal(await f.service.confirmation(order.id, 'wrong'), null);
  assert.ok(f.provider.pay(order, '2026-10-25T23:59:59+03:00'));
  f.setTime('2026-11-03T12:00:00+03:00');
  const bad = { ...f.callback(order), key: 'invalid' }; assert.equal((await f.service.callback(bad)).status, 403);
  assert.equal((await f.service.callback(f.callback(order))).status, 200);
  assert.equal((await f.service.callback(f.callback(order))).status, 200); assert.equal(f.settlements, 1);
  const confirmation = await f.service.confirmation(order.id, result.accessToken);
  assert.equal(confirmation.status, 'paid'); assert.equal(confirmation.quantity, 1); assert.equal(confirmation.startDate, EVENT.startDate);
  assert.doesNotMatch(JSON.stringify(confirmation), /test@example|accessToken|contact/);
});

test('mock provider prevents expired invoice payment before debit; a fresh order uses new tariff', async () => {
  const f = fixture(); const first = await f.service.checkout(form(1600));
  assert.equal(f.provider.pay(f.orders.get(first.orderId), '2026-10-26T00:00:00+03:00'), false);
  assert.equal((await f.service.callback(f.callback(f.orders.get(first.orderId)))).status, 400);
  f.setTime('2026-10-26T00:00:00+03:00');
  assert.equal((await f.service.checkout(form(1600))).status, 409); assert.equal(f.providerCalls, 1);
  const second = await f.service.checkout(form(1800)); assert.equal(second.amount, 1800); assert.notEqual(second.orderId, first.orderId);
});

test('signed notification cannot substitute invoice/order/amount/payment state or late payment', async () => {
  for (const mutation of [{ invoiceId: 'wrong' }, { orderId: 'wrong' }, { amount: 1 }, { status: 'failed' }, { paidAt: '2026-10-26T00:00:00+03:00' }, { paidAt: '2026-10-25T23:59:59' }]) {
    const f = fixture(); const result = await f.service.checkout(form(1600)); const order = f.orders.get(result.orderId);
    f.provider.pay(order, '2026-10-25T23:59:59+03:00'); Object.assign(f.payments.get('42'), mutation);
    assert.equal((await f.service.callback(f.callback(order))).status, 400); assert.equal(f.settlements, 0);
    assert.equal((await f.service.confirmation(order.id, result.accessToken)).status, 'pending');
  }
});

test('provider or persistence failure never fabricates a successful order', async () => {
  const f = fixture(); f.provider.createInvoice = async () => { throw new Error('network'); };
  assert.equal((await f.service.checkout(form(1600))).status, 503); assert.equal([...f.orders.values()][0].status, 'failed');
  const g = fixture(); g.repository.create = async () => { throw new Error('store'); };
  await assert.rejects(g.service.checkout(form(1600))); assert.equal(g.providerCalls, 0);
});

test('rendered page has one speaker, accurate dates, canonical, data-driven program and no unavailable offers', () => {
  for (const time of ['2026-10-13T12:00:00+03:00', '2026-11-01T12:00:00+03:00', '2026-11-01T15:00:00+03:00']) {
    const html = render(ms(time));
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}|EventCompleted|Шехирев|гипнотерап|медитаци|Вячеслав/i);
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.performer.name, 'Сергей Николаевич Кузнецов'); assert.equal(schema.startDate, EVENT.startDate); assert.equal(schema.offers, undefined);
    assert.equal(ms(schema.endDate) - ms(schema.startDate), 3 * 60 * 60_000);
    for (const item of EVENT.schedule[0].items) assert.ok(html.includes(item.title));
    assert.match(html, /method="post" action="\/api\/seminar-checkout"/);
  }
  const past = render(ms(EVENT.endDate)); assert.match(past, /Мастер-класс завершён/); assert.doesNotMatch(past, />Зарегистрироваться и оплатить</);
});
