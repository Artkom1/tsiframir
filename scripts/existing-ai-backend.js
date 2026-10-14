'use strict';

// Preserve the existing AI deployment only. No other site/API route uses Vercel.
const localHandler = require('../api/ai-interpretation');
const BACKEND = 'https://numerology-forum-landing.vercel.app/api/ai-interpretation';
const RESPONSE_LIMIT = 65536;

function createExistingAIHandler({ fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  return async function existingAI(req, res) {
    // Reuse the unchanged method/origin guard before contacting any backend.
    if (req.method !== 'POST' || !localHandler._test.isSameOrigin(req)) return localHandler(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    const fallback = () => !res.destroyed && !res.writableEnded && res.status(200).json({
      success: false, fallback: true,
      message: 'Не удалось получить анализ от AI. Используется локальный анализ.'
    });
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    try {
      if (req.aborted || res.destroyed) { controller.abort(); return; }
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (Buffer.byteLength(body) > 2048) return res.status(413).json({ success: false, error: 'payload_too_large' });
      const response = await fetchImpl(BACKEND, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        // Deliberately no cookies, credentials, forwarding IP or user-selected URL.
        headers: {
          'Content-Type': String(req.headers['content-type'] || ''),
          Origin: String(req.headers.origin || ''),
          'X-Requested-With': String(req.headers['x-requested-with'] || '')
        },
        body
      });
      if (![200, 400, 401, 403, 405, 413, 415, 429].includes(response.status) ||
          !String(response.headers.get('content-type')).includes('application/json')) {
        await response.body?.cancel();
        return fallback();
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > RESPONSE_LIMIT) { controller.abort(); return fallback(); }
        chunks.push(chunk);
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!result || typeof result !== 'object' || Array.isArray(result)) return fallback();
      if (!res.destroyed && !res.writableEnded) return res.status(response.status).json(result);
    } catch (_) {
      return fallback();
    } finally {
      clearTimeout(timer);
      req.removeListener('aborted', disconnect);
      res.removeListener('close', disconnect);
    }
  };
}

module.exports = { createExistingAIHandler };
