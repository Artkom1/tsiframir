'use strict';

const crypto = require('crypto');
const { parseOrderId, validateKnownPayment } = require('../lib/event-policy');
const { EVENT_ID } = require('../lib/seminar-policy');

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

  const seminar = typeof orderid === 'string' && orderid.startsWith('TSMNN-');
  const match = seminar && /^TSMNN-20261101-(EARLY|STANDARD|EVENT_DAY)-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(orderid);
  if (seminar && (!match || typeof id !== 'string' || !/^\d{1,20}$/.test(id) ||
      typeof sum !== 'string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(sum) ||
      typeof clientid !== 'string' || clientid.length > 100 || /[\x00-\x1f\x7f<>]/.test(clientid) ||
      typeof key !== 'string' || !/^[a-f0-9]{32}$/.test(key))) return res.status(400).send('Bad Request');

  const expectedKey = md5(String(id) + String(sum) + String(clientid) + String(orderid) + secret);
  if (!safeEqual(expectedKey, key)) return res.status(403).send('Forbidden');
  const parsed = seminar ? { eventId: EVENT_ID, tariffCode: match[1] } : parseOrderId(orderid);
  if (!parsed) return res.status(400).send('Bad Request: unknown order');

  // Acknowledge an authentic notification even when delivery is late/repeated.
  // This stateless ACK issues no ticket/email and sets no local paid status.
  // The provider remains the ledger; the signature does not establish invoice
  // expiry, unique order provenance or settlement time. Those merchant guarantees
  // must be verified before enabling seminar sales. Never reject solely because
  // delivery occurred after closing: a timely payment can be notified later.
  const decision = validateKnownPayment(parsed.eventId, parsed.tariffCode, sum);
  if (!decision.ok) return res.status(decision.status).send('Payment rejected: ' + decision.code);

  return res.status(200).send('OK ' + md5(String(id) + secret));
};

module.exports._test = { md5, safeEqual };
