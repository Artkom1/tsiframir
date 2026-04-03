/**
 * PayKeeper Config Endpoint
 * Returns non-secret configuration for the frontend payment widget.
 * The server URL is NOT a secret — it is just an address.
 * Secret word (PAYKEEPER_SECRET) lives only in the callback handler.
 */
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const serverUrl = process.env.PAYKEEPER_SERVER_URL;

  if (!serverUrl) {
    return res.status(503).json({
      ok: false,
      error: 'PAYKEEPER_SERVER_URL не задан. Настройте переменную окружения в Vercel.'
    });
  }

  return res.status(200).json({
    ok: true,
    serverUrl: serverUrl,
    testMode: serverUrl.includes('demo') || process.env.NODE_ENV !== 'production'
  });
};
