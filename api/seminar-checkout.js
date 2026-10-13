'use strict';
const { validateRegistration } = require('./lib/seminar-policy');
const { prepareInvoice } = require('./lib/seminar-paykeeper-api');
const { paymentAvailable, paymentConfig } = require('./lib/seminar-runtime');

function createHandler({ available = paymentAvailable, config = paymentConfig, now = Date.now, prepare = prepareInvoice } = {}) {
 return async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const origin = req.headers?.origin;
  if (origin && !['https://tsiframir.ru', 'https://www.tsiframir.ru'].includes(origin)) {
    return res.status(403).json({ ok: false, error: 'invalid_origin' });
  }
  if (!String(req.headers?.['content-type'] || '').startsWith('application/json')) return res.status(415).json({ ok: false, error: 'json_required' });
  const serverTime = now();
  const decision = validateRegistration(req.body, serverTime);
  if (!decision.ok) return res.status(decision.status).json(decision);
  if (!available()) return res.status(503).json({ ok: false, error: 'payment_temporarily_unavailable' });
  try {
    // Return to the same approved origin so its sessionStorage receipt survives.
    const payment = await prepare(req.body, { ...config(), returnOrigin: origin || 'https://tsiframir.ru' }, serverTime);
    return res.status(payment.ok ? 200 : payment.status).json(payment);
  } catch (_) {
    // Never reflect configuration, contacts or provider credentials into errors.
    return res.status(503).json({ ok: false, error: 'payment_temporarily_unavailable' });
  }
 };
}

module.exports = createHandler();
module.exports._test = { createHandler };
