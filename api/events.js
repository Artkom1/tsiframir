'use strict';
const { getPublicEvents } = require('./lib/event-policy');
const { EVENT_ID, quote } = require('./lib/seminar-policy');

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method_not_allowed' }); }
  const current = quote();
  return res.status(200).json({ events: getPublicEvents().map(event => event.id === EVENT_ID ? {
    ...event, status: current.status, salesOpen: current.salesOpen,
    registrationUrl: current.salesOpen ? event.registrationUrl : null
  } : event) });
};
