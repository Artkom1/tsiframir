'use strict';
const { invoiceStatus } = require('./lib/seminar-paykeeper-api');
const { paymentConfig } = require('./lib/seminar-runtime');

function createHandler({ config = paymentConfig, read = invoiceStatus } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'method_not_allowed' }); }
    const origin = req.headers?.origin;
    if (origin && !['https://tsiframir.ru', 'https://www.tsiframir.ru'].includes(origin)) return res.status(403).json({ ok: false, error: 'invalid_origin' });
    if (!String(req.headers?.['content-type'] || '').startsWith('application/json')) return res.status(415).json({ ok: false, error: 'json_required' });
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.statusToken !== 'string') return res.status(400).json({ ok: false, error: 'invalid_request' });
    try {
      const result = await read(req.body.statusToken, config());
      return res.status(result.ok ? 200 : result.status).json(result);
    } catch (_) { return res.status(503).json({ ok: false, error: 'status_temporarily_unavailable' }); }
  };
}
module.exports = createHandler();
module.exports._test = { createHandler };
