'use strict';

const { authorizeSale } = require('../lib/event-policy');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const decision = authorizeSale(body.eventId, body.tariffCode, body.amount);
  if (!decision.ok) return res.status(decision.status).json({ ok: false, error: decision.code });

  // Future provider integration belongs here, strictly after the shared policy.
  // There are currently no events for which this branch can be reached.
  return res.status(503).json({ ok: false, error: 'payment_provider_not_configured_for_event' });
};
