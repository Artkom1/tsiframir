'use strict';
const crypto = require('node:crypto');
const { EVENT, EVENT_ID, validateRegistration } = require('./seminar-policy');
const { merchantOrigin, expiryInMerchantZone, SERVICE } = require('./seminar-paykeeper-html');
const RETURN_PATH = '/forums/2026-nizhny-novgorod/#registration';
const ORDER = /^TSMNN-20261101-(EARLY|STANDARD|EVENT_DAY)-[a-f0-9-]{36}$/;

function signature(value, secret) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('status_secret_missing');
  return crypto.createHmac('sha256', secret).update('seminar-invoice-status:v1:' + value).digest('base64url');
}
function statusToken(claims, secret) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return body + '.' + signature(body, secret);
}
function readToken(token, secret) {
  if (typeof token !== 'string' || token.length > 1024 || !/^[\w-]+\.[\w-]{43}$/.test(token)) return null;
  const [body, provided] = token.split('.');
  const expected = signature(body, secret);
  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (claims.v !== 1 || claims.eventId !== EVENT_ID || !/^\d{10,32}$/.test(claims.invoiceId) ||
        // 2000 is accepted only for previously signed receipts, never new sales.
        !ORDER.test(claims.orderId) || ![1600, 1800, 2000, 3000].includes(claims.amount) ||
        !Number.isFinite(Date.parse(claims.expiresAt))) return null;
    return claims;
  } catch (_) { return null; }
}

function createApi(config, fetchImpl = fetch) {
  const origin = merchantOrigin(config.serverUrl);
  if (!config.apiLogin || !config.apiPassword) throw new Error('paykeeper_api_missing');
  const authorization = 'Basic ' + Buffer.from(config.apiLogin + ':' + config.apiPassword).toString('base64');
  async function request(path, data) {
    // Fixed merchant, no redirects (credentials must never follow a redirect).
    const response = await fetchImpl(origin + path, {
      method: data ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
      headers: { Authorization: authorization, Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(data ? { body: new URLSearchParams(data).toString() } : {}),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('paykeeper_unavailable');
    const json = await response.json();
    if (!json || json.result === 'fail' || json.error) throw new Error('paykeeper_unavailable');
    return json;
  }
  return { origin, request };
}

async function prepareInvoice(body, config, now = Date.now(), { fetchImpl = fetch, clock = Date.now } = {}) {
  const decision = validateRegistration(body, now);
  if (!decision.ok) return decision;
  const q = decision.quote;
  if (Date.parse(q.expiresAt) <= now) return { ok: false, status: 409, error: 'quote_expired' };
  const api = createApi(config, fetchImpl);
  const returnOrigin = config.returnOrigin || 'https://tsiframir.ru';
  if (!['https://tsiframir.ru', 'https://www.tsiframir.ru'].includes(returnOrigin)) throw new Error('invalid_return_origin');
  const orderId = `TSMNN-20261101-${q.tariffCode.toUpperCase()}-${crypto.randomUUID()}`;
  const token = await api.request('/info/settings/token/');
  if (typeof token.token !== 'string' || !token.token) throw new Error('paykeeper_unavailable');
  const expiry = expiryInMerchantZone(q.expiresAt, config.providerTimeZone);
  const service = {
    service_name: SERVICE,
    cart: JSON.stringify([{ name: 'Участие в мастер-классе «Код богатства», 01.11.2026, 12:00–15:00 МСК, 1 человек',
      price: q.amount, quantity: 1, sum: q.amount, tax: 'none' }]),
    user_result_callback: returnOrigin + RETURN_PATH,
    custom_data: JSON.stringify({ eventId: EVENT_ID, tariff: q.tariffCode, quantity: 1, codeWord: decision.codeWord })
  };
  // preview creates a durable invoice without sending an unsolicited invoice email.
  // All amounts, expiry, cart and return parameters go server-to-server only.
  const invoice = await api.request('/change/invoice/preview/', {
    token: token.token, pay_amount: q.amount.toFixed(2), orderid: orderId,
    clientid: decision.contact.name, client_email: decision.contact.email, client_phone: decision.contact.phone,
    expiry, service_name: JSON.stringify(service)
  });
  const invoiceId = String(invoice.invoice_id || '');
  if (!/^\d{10,32}$/.test(invoiceId)) throw new Error('paykeeper_unavailable');
  // No provider-supplied URL is reflected. A contact-free opaque invoice ID is
  // the only path component exposed to the browser.
  if (clock() >= Date.parse(q.expiresAt)) return { ok: false, status: 409, error: 'quote_expired' };
  const claims = { v: 1, eventId: EVENT_ID, invoiceId, orderId, amount: q.amount, expiresAt: q.expiresAt };
  return { ok: true, invoiceUrl: api.origin + '/bill/' + invoiceId,
    statusToken: statusToken(claims, config.secret), orderId, amount: q.amount, quantity: 1, expiresAt: q.expiresAt };
}

async function invoiceStatus(token, config, { fetchImpl = fetch } = {}) {
  const claims = readToken(token, config.secret);
  if (!claims) return { ok: false, status: 404, error: 'order_not_found' };
  const api = createApi(config, fetchImpl);
  const result = await api.request('/info/invoice/byid/?id=' + claims.invoiceId);
  const invoice = Array.isArray(result) && result.length === 1 ? result[0] : result;
  if (String(invoice.id) !== claims.invoiceId || invoice.orderid !== claims.orderId ||
      String(invoice.pay_amount) !== claims.amount.toFixed(2) ||
      invoice.expiry_datetime !== expiryInMerchantZone(claims.expiresAt, config.providerTimeZone)) {
    throw new Error('paykeeper_invoice_mismatch');
  }
  // The provider's authenticated durable ledger is the authority. A redirect,
  // caller-supplied status, stale quote or callback delivery time is never proof.
  const paid = invoice.status === 'paid' && /^\d+$/.test(String(invoice.paymentid || '')) &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(invoice.paid_datetime || ''));
  const state = paid ? 'paid' : invoice.status === 'expired' ? 'expired' : 'pending';
  return { ok: true, state, orderId: claims.orderId, amount: claims.amount, quantity: 1,
    expiresAt: claims.expiresAt,
    ...(paid ? { confirmation: { title: EVENT.title, startDate: EVENT.startDate, endDate: EVENT.endDate,
      venue: 'Маринс Парк Отель', address: 'Нижний Новгород, ул. Советская, 12' } } : {}) };
}
module.exports = { prepareInvoice, invoiceStatus, statusToken, readToken };
