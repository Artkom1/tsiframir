'use strict';

const { getEvent } = require('./event-policy');
const EVENT_ID = 'seminar-2026-nizhny-novgorod';
const EVENT = getEvent(EVENT_ID);

// Date.parse always receives an explicit offset. Browser and runtime time zones
// never participate in either the tariff or invoice lifetime calculation.
function quote(now = Date.now()) {
  const time = Number(now);
  if (!Number.isFinite(time)) throw new TypeError('Invalid server time');
  const start = Date.parse(EVENT.startDate);
  const end = Date.parse(EVENT.endDate);
  const close = Date.parse(EVENT.salesClose);
  const status = time >= end ? 'past' : time >= start ? 'live' : 'upcoming';
  const salesOpen = EVENT.salesOpen && time < close;
  const tariff = salesOpen ? EVENT.tariffs.find(item => item.enabled &&
    (!item.validFrom || time >= Date.parse(item.validFrom)) && time < Date.parse(item.validUntil)) : null;
  const transitions = [start, end, close, Date.parse(tariff?.validUntil)].filter(value => value > time);
  return {
    eventId: EVENT_ID, serverTime: new Date(time).toISOString(), timeZone: EVENT.timeZone,
    status, salesOpen: Boolean(salesOpen && tariff), currency: 'RUB', quantity: 1,
    tariffCode: tariff?.code || null, amount: tariff?.amount || null,
    validUntil: tariff?.validUntil || null,
    nextTransitionAt: transitions.length ? new Date(Math.min(...transitions)).toISOString() : null,
    expiresAt: tariff ? new Date(Math.floor(Math.min(time + 15 * 60_000, Date.parse(tariff.validUntil), close) / 1000) * 1000).toISOString() : null,
    salesClose: EVENT.salesClose
  };
}

function validateRegistration(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, status: 400, error: 'invalid_form' };
  const allowed = new Set(['eventId', 'name', 'email', 'phone', 'consent', 'expectedAmount']);
  if (Object.keys(body).some(key => !allowed.has(key))) return { ok: false, status: 400, error: 'unexpected_order_parameter' };
  if (body.eventId !== EVENT_ID) return { ok: false, status: 404, error: 'unknown_event' };
  const current = quote(now);
  if (!current.salesOpen) return { ok: false, status: 410, error: 'event_sales_closed', quote: current };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  // The existing PayKeeper form accepted an optional phone, up to 20 characters.
  const phone = body.phone === undefined ? '' : typeof body.phone === 'string' ? body.phone.trim() : null;
  if (name.length < 2 || name.length > 100 || /[\x00-\x1f\x7f<>]/.test(name) ||
      email.length > 160 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || body.consent !== true ||
      phone === null || phone.length > 20 || (phone && (!/^[+\d ()-]+$/.test(phone) || !/\d/.test(phone)))) {
    return { ok: false, status: 400, error: 'invalid_form' };
  }
  // This is only a consent precondition. The client value never sets the price.
  if (body.expectedAmount !== current.amount) return { ok: false, status: 409, error: 'price_changed', quote: current };
  return { ok: true, quote: current, contact: { name, email, phone } };
}

module.exports = { EVENT, EVENT_ID, quote, validateRegistration };
