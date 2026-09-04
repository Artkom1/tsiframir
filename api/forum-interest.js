'use strict';

const crypto = require('crypto');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestWindows = new Map();
const recentDeliveries = new Map();

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function prune(map, now) {
  if (map.size < 1000) return;
  for (const [key, value] of map) if (value.expiresAt <= now) map.delete(key);
}

function clientKey(req) {
  const forwarded = clean(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'], 200);
  const address = forwarded.split(',')[0].trim() || clean(req.socket?.remoteAddress, 100) || 'unknown';
  return crypto.createHash('sha256').update(address).digest('hex');
}

function isRateLimited(req, now) {
  prune(requestWindows, now);
  const key = clientKey(req);
  const current = requestWindows.get(key);
  if (!current || current.expiresAt <= now) {
    requestWindows.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > 16384) {
    return res.status(413).json({ ok: false, error: 'payload_too_large' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (clean(body.website, 200)) return res.status(200).json({ ok: true });
  const startedAt = Number(body.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < 1500 || Date.now() - startedAt > 86400000) {
    return res.status(400).json({ ok: false, error: 'invalid_submission_timing' });
  }
  const email = clean(body.email, 160).toLowerCase();
  const name = clean(body.name, 100);
  if (!EMAIL_RE.test(email) || body.consent !== true) return res.status(400).json({ ok: false, error: 'invalid_form' });

  const webhook = clean(process.env.FORUM_INTEREST_WEBHOOK_URL, 1000);
  if (!webhook) return res.status(503).json({ ok: false, error: 'delivery_not_configured' });
  if (!/^https:\/\//i.test(webhook)) return res.status(500).json({ ok: false, error: 'invalid_delivery_configuration' });

  const now = Date.now();
  if (isRateLimited(req, now)) return res.status(429).json({ ok: false, error: 'rate_limited' });
  prune(recentDeliveries, now);
  const deliveryKey = crypto.createHash('sha256').update(email).digest('hex');
  const recent = recentDeliveries.get(deliveryKey);
  if (recent && recent.expiresAt > now) return res.status(200).json({ ok: true });

  try {
    const delivery = await fetch(webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'tsiframir.ru', topic: 'next_forum', email, name: name || undefined, consent: true }),
      signal: AbortSignal.timeout(5000)
    });
    if (!delivery.ok) return res.status(502).json({ ok: false, error: 'delivery_failed' });
    recentDeliveries.set(deliveryKey, { expiresAt: now + WINDOW_MS });
    return res.status(200).json({ ok: true });
  } catch (_) {
    return res.status(502).json({ ok: false, error: 'delivery_failed' });
  }
};

module.exports._test = { clientKey, isRateLimited, requestWindows, recentDeliveries };
