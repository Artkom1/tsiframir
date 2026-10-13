'use strict';

// Native PayKeeper HTML integration; no JSON API login is required to sign it.
// This builder is not a sales switch. Runtime remains closed until the existing
// merchant's signature, receipt, expiry and confirmation settings are verified.
const crypto = require('node:crypto');
const { validateRegistration } = require('./seminar-policy');
const MERCHANT_ORIGIN = 'https://tsiframir.server.paykeeper.ru';
const SERVICE = 'Число π и система ЦифраМир, 01.11.2026, 12:00–18:00 МСК; Маринс Парк Отель, Нижний Новгород, Советская, 12; 1 участник';

function merchantOrigin(value) {
  const url = new URL(String(value).startsWith('https://') ? value : 'https://' + value);
  if (url.origin !== MERCHANT_ORIGIN || url.username || url.password ||
      url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('unexpected_paykeeper_merchant');
  return url.origin;
}

function expiryInMerchantZone(instant, timeZone) {
  // PayKeeper consumes a wall-clock value in the account's configured zone.
  // Never silently assume that the account uses the event/runtime/browser zone.
  if (typeof timeZone !== 'string' || !timeZone) throw new Error('paykeeper_timezone_unverified');
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_expiry');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function signFields(fields, secret) {
  if (typeof secret !== 'string' || !secret) throw new Error('paykeeper_secret_missing');
  // Exact documented order, UTF-8, two fractional digits, expiry before secret.
  const names = ['sum', 'clientid', 'orderid', 'service_name', 'client_email', 'client_phone', 'expiry'];
  return crypto.createHash('sha256').update(names.map(name => fields[name] || '').join('') + secret, 'utf8').digest('hex');
}

function prepareHtmlPayment(body, config, now = Date.now()) {
  const decision = validateRegistration(body, now);
  if (!decision.ok) return decision;
  const origin = merchantOrigin(config.serverUrl);
  const q = decision.quote;
  if (Date.parse(q.expiresAt) <= now) return { ok: false, status: 409, error: 'quote_expired' };
  const orderId = `TSMNN-20261101-${q.tariffCode.toUpperCase()}-${crypto.randomUUID()}`;
  const fields = {
    sum: q.amount.toFixed(2), clientid: decision.contact.name, orderid: orderId,
    service_name: SERVICE, client_email: decision.contact.email, client_phone: '',
    expiry: expiryInMerchantZone(q.expiresAt, config.providerTimeZone)
  };
  fields.sign = signFields(fields, config.secret);
  // No unsigned cart/return override: keep the existing merchant's verified
  // receipt/return settings. The provider owns its payment confirmation/ledger.
  // These contact fields must travel via POST, never a URL or application log.
  return { ok: true, method: 'POST', action: origin + '/create/', fields,
    orderId, eventId: q.eventId, tariffCode: q.tariffCode, amount: q.amount,
    quantity: 1, createdAt: q.serverTime, expiresAt: q.expiresAt };
}

module.exports = { prepareHtmlPayment, expiryInMerchantZone, signFields };
