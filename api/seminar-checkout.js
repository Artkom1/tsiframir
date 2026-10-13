'use strict';
const { validateRegistration } = require('./lib/seminar-policy');

module.exports = async function handler(req, res) {
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
  const decision = validateRegistration(req.body);
  if (!decision.ok) return res.status(decision.status).json(decision);
  // Do not collect contacts, create an ephemeral order or promise a ticket when
  // the existing project's durable payment infrastructure is unavailable.
  return res.status(503).json({ ok: false, error: 'payment_temporarily_unavailable' });
};
