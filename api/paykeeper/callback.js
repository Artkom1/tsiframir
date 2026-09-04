'use strict';

const crypto = require('crypto');
const { authorizeSale, parseOrderId } = require('../lib/event-policy');

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const secret = String(process.env.PAYKEEPER_SECRET || '').replace(/[\r\n\t]/g, '').trim();
  if (!secret || secret === 'your_secret_word_here') return res.status(500).send('Configuration error');
  const { id, sum, clientid, orderid, key } = req.body || {};
  if (!id || !sum || !clientid || !orderid || !key) return res.status(400).send('Bad Request');

  const expectedKey = md5(String(id) + String(sum) + String(clientid) + String(orderid) + secret);
  if (!safeEqual(expectedKey, key)) return res.status(403).send('Forbidden');
  const parsed = parseOrderId(orderid);
  if (!parsed) return res.status(400).send('Bad Request: unknown order');

  const decision = authorizeSale(parsed.eventId, parsed.tariffCode, sum);
  if (!decision.ok) return res.status(decision.status).send('Payment rejected: ' + decision.code);

  // Future fulfilment requires durable idempotency before sales can be opened.
  return res.status(503).send('Payment fulfilment unavailable');
};

module.exports._test = { md5, safeEqual };
