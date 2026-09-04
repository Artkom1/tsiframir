const allowedEvents = new Set([
  'home_primary_cta_click', 'calculator_start', 'calculator_complete', 'event_card_view',
  'event_interest_submit', 'archive_view', 'archive_to_next_event_click', 'book_click',
  'contact_click', 'checkout_start', 'checkout_success', 'checkout_error'
]);

export function track(name, parameters = {}) {
  if (!allowedEvents.has(name)) return false;
  const safeParameters = Object.fromEntries(Object.entries(parameters).filter(([key, value]) => {
    return !/email|phone|name|message|birth|date/i.test(key) && ['string', 'number', 'boolean'].includes(typeof value);
  }));
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...safeParameters });
    if (typeof window.gtag === 'function') window.gtag('event', name, safeParameters);
    if (window.TSIFRAMIR_ANALYTICS_DEBUG === true) console.info('[analytics]', name, safeParameters);
    return true;
  } catch (_) {
    return false;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-analytics]');
  if (target) track(target.dataset.analytics, { location: target.dataset.analyticsLocation || 'page' });
});
