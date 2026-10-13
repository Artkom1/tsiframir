'use strict';
const { render } = require('./lib/seminar-render');
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).send('Method Not Allowed'); }
  return res.status(200).send(req.method === 'HEAD' ? '' : render());
};
