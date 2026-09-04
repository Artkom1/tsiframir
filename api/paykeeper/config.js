'use strict';

/** Retired browser-direct PayKeeper configuration endpoint. */
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  return res.status(410).json({ ok: false, paymentAvailable: false, error: 'event_sales_closed' });
};
