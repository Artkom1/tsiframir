'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
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

  try {
    const delivery = await fetch(webhook, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'tsiframir.ru', topic: 'next_forum', email, name: name || undefined, consent: true })
    });
    if (!delivery.ok) return res.status(502).json({ ok: false, error: 'delivery_failed' });
    return res.status(200).json({ ok: true });
  } catch (_) {
    return res.status(502).json({ ok: false, error: 'delivery_failed' });
  }
};
