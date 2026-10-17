'use strict';
const { EVENT_ID } = require('./seminar-policy');
const { createApi } = require('./seminar-paykeeper-api');
const ORDER = /^TSMNN-20261101-(EARLY|STANDARD|EVENT_DAY)-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const normalize = value => value.trim().toLocaleLowerCase('ru-RU');
const text = value => value == null || value === 'null' ? '' : String(value);
const date = value => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text(value)) ? value.replace(' ', 'T') + '+03:00' : '';

function metadata(service) {
  // PayKeeper expands preview JSON to PKC/PKURC/PKDC segments. The first
  // PKDC marker starts the final JSON segment; markers inside a code are data.
  if (typeof service !== 'string') throw new Error('invoice_metadata_invalid');
  let data;
  if (service.startsWith('{')) {
    const parsed = JSON.parse(service);
    data = typeof parsed.custom_data === 'string' ? JSON.parse(parsed.custom_data) : parsed.custom_data;
  } else {
    const at = service.indexOf(';PKDC|');
    if (at < 0 || !service.endsWith('|')) throw new Error('invoice_metadata_invalid');
    data = JSON.parse(service.slice(at + 6, -1));
  }
  if (!data || data.eventId !== EVENT_ID || (data.codeWord !== undefined && typeof data.codeWord !== 'string')) throw new Error('invoice_metadata_invalid');
  return data;
}

async function readOrders(config, { fetchImpl = fetch } = {}) {
  // History/list excludes preview invoices in `created` state. Search includes
  // them, so registration is visible before the customer opens payment.
  const api = createApi(config, fetchImpl);
  const data = await api.request('/info/invoice/search/?' + new URLSearchParams({
    query: 'TSMNN-20261101-*', start_date: '2026-01-01', end_date: '2027-01-01'
  }));
  if (!Array.isArray(data)) throw new Error('invoice_list_invalid');
  const orders = new Map();
  for (const invoice of data) {
    if (!ORDER.test(invoice.orderid)) continue;
    const meta = metadata(invoice.service_name);
    const createdAt = date(invoice.created_datetime);
    const paidAt = date(invoice.paid_datetime);
    const amount = Number(invoice.pay_amount);
    if (!createdAt || !Number.isFinite(amount) || amount < 0) throw new Error('invoice_data_invalid');
    const paid = invoice.status === 'paid' && /^\d+$/.test(text(invoice.paymentid)) && !!paidAt;
    const order = {
      eventId: EVENT_ID, orderId: invoice.orderid, name: text(invoice.clientid),
      phone: text(invoice.client_phone), email: text(invoice.client_email), codeWord: meta.codeWord ?? '',
      createdAt, amount, currency: 'RUB', status: paid ? 'paid' : invoice.status === 'expired' ? 'expired' : 'pending',
      paymentId: paid ? text(invoice.paymentid) : '', paidAt: paid ? paidAt : '',
      tariff: invoice.orderid.match(ORDER)[1], quantity: 1, expiresAt: date(invoice.expiry_datetime)
    };
    // Never key by email or copy a second order over a previous paid order.
    if (orders.has(order.orderId) && JSON.stringify(orders.get(order.orderId)) !== JSON.stringify(order)) throw new Error('duplicate_order_identity');
    orders.set(order.orderId, order);
  }
  return [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.orderId.localeCompare(b.orderId));
}

function filterOrders(orders, { code = '', paid = false, codeState = 'all' } = {}) {
  const needle = normalize(code);
  return orders.filter(order => (!paid || order.status === 'paid') &&
    (!needle || normalize(order.codeWord).includes(needle)) &&
    (codeState === 'all' || (codeState === 'with' ? !!normalize(order.codeWord) : !normalize(order.codeWord))));
}

const COLUMNS = [
  ['name', 'Имя'], ['phone', 'Телефон'], ['email', 'Email'], ['codeWord', 'Промокод / кодовое слово'],
  ['status', 'Статус оплаты'], ['amount', 'Сумма'], ['createdAt', 'Дата регистрации (МСК)'],
  ['orderId', 'Заказ'], ['eventId', 'Мероприятие'], ['currency', 'Валюта'], ['paymentId', 'Платёж'], ['paidAt', 'Дата оплаты (МСК)'],
  ['tariff', 'Тариф'], ['quantity', 'Количество'], ['expiresAt', 'Счёт действует до (МСК)']
];
const STATUS = { paid: 'Оплачен', pending: 'Ожидает оплаты', expired: 'Истёк / отменён' };
function csv(orders) {
  const cell = value => {
    let s = String(value ?? '');
    // Quoting alone does not stop spreadsheet formulas. Preserve storage;
    // prefix risky export cells (including +phones) with a text apostrophe.
    if (/^[\s\uFEFF]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + [COLUMNS.map(([, label]) => cell(label)).join(';'), ...orders.map(order =>
    COLUMNS.map(([key]) => cell(key === 'status' ? STATUS[order.status] : order[key])).join(';'))].join('\r\n') + '\r\n';
}
module.exports = { readOrders, filterOrders, csv, metadata, COLUMNS, STATUS };
