'use strict';
const { quote } = require('./lib/seminar-policy');
const { paymentAvailable } = require('./lib/seminar-runtime');

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  return res.status(200).json({ ...quote(), paymentAvailable: paymentAvailable() });
};
