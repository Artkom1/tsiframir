'use strict';

const eventData = require('../../assets/data/events.json');
const PUBLIC_STATUSES = new Set(['upcoming', 'live', 'past', 'cancelled']);
const SALE_STATUSES = new Set(['upcoming', 'live']);

function getEvent(eventId) {
  return eventData.events.find((event) => event.id === eventId) || null;
}

function getEventByPaymentCode(paymentCode) {
  return eventData.events.find((event) => event.paymentCode === paymentCode) || null;
}

function getPublicEvents() {
  return eventData.events.filter((event) => PUBLIC_STATUSES.has(event.status));
}

function getTariff(event, tariffCode) {
  if (!event || !Array.isArray(event.tariffs)) return null;
  return event.tariffs.find((tariff) => tariff.code === tariffCode) || null;
}

function authorizeSale(eventId, tariffCode, amount) {
  const event = getEvent(eventId);
  if (!event) return { ok: false, status: 404, code: 'unknown_event' };
  if (!PUBLIC_STATUSES.has(event.status) || !SALE_STATUSES.has(event.status) || event.salesOpen !== true) {
    return { ok: false, status: 410, code: 'event_sales_closed' };
  }
  const tariff = getTariff(event, tariffCode);
  if (!tariff || tariff.enabled !== true) return { ok: false, status: 404, code: 'unknown_or_disabled_tariff' };
  if (!Number.isFinite(Number(amount)) || Number(amount) !== tariff.amount) {
    return { ok: false, status: 400, code: 'amount_mismatch' };
  }
  return { ok: true, status: 200, event, tariff };
}

function validateKnownPayment(eventId, tariffCode, amount) {
  const event = getEvent(eventId);
  if (!event) return { ok: false, status: 404, code: 'unknown_event' };
  const tariff = getTariff(event, tariffCode);
  if (!tariff) return { ok: false, status: 404, code: 'unknown_tariff' };
  if (!Number.isFinite(Number(amount)) || Number(amount) !== tariff.amount) {
    return { ok: false, status: 400, code: 'amount_mismatch' };
  }
  return { ok: true, status: 200, event, tariff };
}

function parseOrderId(orderId) {
  const current = /^TSIFRAMIR-([A-Z0-9]+)-([A-Z0-9_]+)-\d{8}-[0-9a-f]{6}$/i.exec(String(orderId || ''));
  if (current) {
    const event = getEventByPaymentCode(current[1].toUpperCase());
    return event ? { eventId: event.id, tariffCode: current[2].toUpperCase() } : null;
  }
  const legacy = /^TSIFRAMIR-([A-Z0-9_]+)-\d{8}-[0-9a-f]{6}$/i.exec(String(orderId || ''));
  return legacy ? { eventId: 'forum-2026-saint-petersburg', tariffCode: legacy[1].toUpperCase() } : null;
}

module.exports = { authorizeSale, getEvent, getPublicEvents, getTariff, parseOrderId, validateKnownPayment };
