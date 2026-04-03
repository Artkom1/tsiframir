/**
 * PayKeeper Config Endpoint
 * Returns non-secret configuration for the frontend payment widget.
 * The server URL is NOT a secret — it is just an address.
 * Secret word (PAYKEEPER_SECRET) lives only in the callback handler.
 */
module.exports = async function handler(req, res) {
  try {
    const origin = (process.env.SITE_URL || '').replace(/[\r\n\t]/g, '').trim() || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const serverUrl = process.env.PAYKEEPER_SERVER_URL;

    if (!serverUrl) {
      res.status(503).json({
        ok: false,
        error: 'PAYKEEPER_SERVER_URL не задан. Настройте переменную окружения в Vercel.'
      });
      return;
    }

    res.status(200).json({
      ok: true,
      serverUrl: serverUrl,
      testMode: process.env.NODE_ENV !== 'production'
    });
  } catch (err) {
    console.error('[PayKeeper/config] handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }
};
