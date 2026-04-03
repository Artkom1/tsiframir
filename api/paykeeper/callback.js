/**
 * PayKeeper POST Callback Handler
 * Endpoint: /api/paykeeper/callback
 *
 * Protocol (from PayKeeper docs):
 *   - PayKeeper sends POST with fields: id, sum, clientid, orderid, key, + extras
 *   - key = md5(id + sum + clientid + orderid + secret_word)
 *   - Response must be: "OK " + md5(id + secret_word)
 *   - If no valid response, PayKeeper retries up to 50 times (every ~1 minute)
 *
 * Validation chain:
 *   1. Verify md5 signature (key field)
 *   2. Validate orderid format (TSIFRAMIR-{CODE}-{DATE}-{HEX})
 *   3. Verify sum matches tariff expected amount
 *   4. Prevent double-processing (in-memory dedup — test-only limitation)
 */

const crypto = require('crypto');

const TARIFF_AMOUNTS = {
  /* ── core tickets ── */
  STANDARD_SEMINAR:       1800,
  VIP_SEMINAR:            5000,
  POWER_PLACES:           5000,
  /* ── 2-day packages ── */
  PACKAGE_STD_PLUS_POWER: 6800,
  PACKAGE_VIP_PLUS_POWER: 10000,
  /* ── speakers ── */
  SPEAKER_10:             5000,
  SPEAKER_15:             7000,
  SPEAKER_20:             10000,
  SPEAKER_30:             13000,
  /* ── backward-compat aliases (old orders may still use these) ── */
  STD: 1800,
  VIP: 5000,
  EXC: 5000
};

/* Accepts any UPPERCASE_ALPHANUMERIC_UNDERSCORE code */
const ORDER_ID_RE = /^TSIFRAMIR-([A-Z0-9_]+)-\d{8}-[0-9a-f]{6}$/i;

const processedPayments = new Set();

function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

function verifySignature(id, sum, clientid, orderid, key, secret) {
  const expected = md5(String(id) + String(sum) + String(clientid) + String(orderid) + String(secret));
  return expected === String(key);
}

function validateOrder(orderid, sum) {
  if (!ORDER_ID_RE.test(orderid)) return { ok: false, reason: 'orderid format invalid' };
  const code = orderid.split('-')[1].toUpperCase();
  const expected = TARIFF_AMOUNTS[code];
  if (expected === undefined) return { ok: false, reason: 'unknown tariff code' };
  if (parseFloat(sum) !== expected) {
    return { ok: false, reason: `sum mismatch: got ${sum}, expected ${expected} for ${code}` };
  }
  return { ok: true, tariffCode: code, expectedSum: expected };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  if (req.method !== 'POST') {
    console.warn('[PayKeeper] Rejected non-POST request:', req.method);
    return res.status(405).send('Method Not Allowed');
  }

  const secret = (process.env.PAYKEEPER_SECRET || '').replace(/[\r\n\t]/g, '').trim();
  if (!secret || secret === 'your_secret_word_here') {
    console.error('[PayKeeper] PAYKEEPER_SECRET not configured');
    return res.status(500).send('Configuration error');
  }

  const { id, sum, clientid, orderid, key } = req.body || {};

  if (!id || !sum || !clientid || !orderid || !key) {
    console.warn('[PayKeeper] Missing required fields:', { id, sum, clientid, orderid, key: !!key });
    return res.status(400).send('Bad Request: missing fields');
  }

  const sigOk = verifySignature(id, sum, clientid, orderid, key, secret);
  if (!sigOk) {
    console.warn('[PayKeeper] Signature verification FAILED for payment id=%s orderid=%s', id, orderid);
    return res.status(403).send('Forbidden: invalid signature');
  }

  const orderCheck = validateOrder(orderid, sum);
  if (!orderCheck.ok) {
    console.warn('[PayKeeper] Order validation FAILED: %s | id=%s orderid=%s sum=%s', orderCheck.reason, id, orderid, sum);
    return res.status(400).send('Bad Request: ' + orderCheck.reason);
  }

  if (processedPayments.has(id)) {
    console.warn('[PayKeeper] Duplicate callback for payment id=%s — ignoring', id);
    const responseHash = md5(String(id) + String(secret));
    return res.status(200).send('OK ' + responseHash);
  }

  processedPayments.add(id);

  console.log('[PayKeeper] ✅ Payment confirmed | id=%s orderid=%s sum=%s clientid=%s tariff=%s',
    id, orderid, sum, clientid, orderCheck.tariffCode);

  const responseHash = md5(String(id) + String(secret));
  return res.status(200).send('OK ' + responseHash);
};
