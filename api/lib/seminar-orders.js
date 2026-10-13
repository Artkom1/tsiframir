'use strict';

// Infrastructure-independent payment contract. No in-memory implementation is
// used by production. The repository must enforce the atomic operations below.
const crypto = require('node:crypto');
const { EVENT, validateRegistration } = require('./seminar-policy');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const md5 = value => crypto.createHash('md5').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function money(value) {
  const text = String(value);
  return /^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : null;
}

function createOrderService({ repository, provider, secret, now = Date.now }) {
  if (!repository?.durable || provider?.expiryEnforced !== true || !secret) throw new Error('payment_infrastructure_unverified');
  for (const method of ['create', 'attachInvoice', 'fail', 'get', 'settleOnce']) {
    if (typeof repository[method] !== 'function') throw new Error('incomplete_order_repository');
  }
  return {
    async checkout(body) {
      const decision = validateRegistration(body, now());
      if (!decision.ok) return decision;
      const q = decision.quote;
      const id = 'TSMNN-' + crypto.randomUUID();
      const accessToken = crypto.randomBytes(32).toString('base64url');
      const order = {
        id, eventId: q.eventId, tariffCode: q.tariffCode, amount: q.amount, currency: q.currency, quantity: 1,
        contact: decision.contact, status: 'creating', createdAt: q.serverTime, expiresAt: q.expiresAt,
        accessTokenHash: digest(accessToken), consentAt: q.serverTime,
        serviceName: 'Участие в семинаре «Число π и система ЦифраМир», 1 ноября 2026, 1 человек'
      };
      // MUST commit before contacting PayKeeper; failed/ambiguous requests are
      // retained for reconciliation, never silently retried as another invoice.
      await repository.create(order);
      try {
        const invoice = await provider.createInvoice(order);
        if (!invoice?.id || !invoice.url || invoice.expiresAt !== order.expiresAt) throw new Error('invalid_invoice');
        const url = new URL(invoice.url);
        if (url.protocol !== 'https:' || url.origin !== provider.origin || url.username || url.password) throw new Error('invalid_invoice_url');
        if (now() >= Date.parse(order.expiresAt)) throw new Error('invoice_expired');
        await repository.attachInvoice(id, { invoiceId: String(invoice.id), status: 'pending' });
        return { ok: true, orderId: id, amount: order.amount, quantity: 1, expiresAt: order.expiresAt, invoiceUrl: url.href, accessToken };
      } catch (_) {
        await repository.fail(id, 'invoice_creation_unconfirmed');
        return { ok: false, status: 503, error: 'invoice_creation_unconfirmed' };
      }
    },

    async callback(body) {
      const { id, sum, clientid, orderid, key } = body || {};
      if (![id, sum, clientid, orderid, key].every(value => typeof value === 'string' && value.length > 0 && value.length <= 200)) return { status: 400, text: 'Bad Request' };
      if (!equal(md5(id + sum + clientid + orderid + secret), key)) return { status: 403, text: 'Forbidden' };
      const order = await repository.get(orderid);
      if (!order || !order.invoiceId || money(sum) !== order.amount * 100 || clientid !== order.contact.name) return { status: 400, text: 'Order mismatch' };
      // Signature covers no invoice ID or payment time: retrieve both through
      // authenticated provider API, never trust extra callback/client fields.
      const payment = await provider.getPayment(id);
      // Adapters must normalize the provider's documented timezone to an
      // explicit offset; never interpret a server-local timestamp implicitly.
      const paidAt = typeof payment?.paidAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(payment.paidAt)
        ? Date.parse(payment.paidAt) : NaN;
      if (payment?.status !== 'paid' || String(payment.id) !== id || payment.orderId !== order.id ||
          String(payment.invoiceId) !== order.invoiceId || money(payment.amount) !== order.amount * 100 ||
          !Number.isFinite(paidAt) || paidAt < Date.parse(order.createdAt) || paidAt >= Date.parse(order.expiresAt)) {
        return { status: 400, text: 'Payment mismatch' };
      }
      // Atomic transaction: unique payment ID + invoice ID + one ticket per
      // order, plus optional email outbox. A repeat returns the existing ticket.
      await repository.settleOnce(order.id, { paymentId: id, invoiceId: order.invoiceId, paidAt: payment.paidAt, quantity: 1 });
      return { status: 200, text: 'OK ' + md5(id + secret) };
    },

    async confirmation(id, accessToken) {
      if (typeof accessToken !== 'string' || accessToken.length > 100) return null;
      const order = await repository.get(id);
      if (!order || !equal(order.accessTokenHash, digest(accessToken))) return null;
      if (order.status !== 'paid') return { orderId: order.id, status: order.status };
      return { orderId: order.id, status: 'paid', quantity: order.quantity, amount: order.amount,
        title: EVENT.title, startDate: EVENT.startDate, endDate: EVENT.endDate,
        address: 'Нижний Новгород, ул. Советская, 12 — Маринс Парк Отель' };
    }
  };
}

module.exports = { createOrderService };
