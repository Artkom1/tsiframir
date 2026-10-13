'use strict';

// Authenticated invoice API and the existing merchant ledger are verified.
// Exact pre-debit bank-session expiry at a tariff boundary remains unverified.
// Owner may explicitly allow completion of an already started bank payment.
// Default is strict/off; this flag must never be enabled without that decision.
function paymentAvailable(env = process.env) {
  return env.PAYKEEPER_SEMINAR_ALLOW_STARTED_PAYMENT_COMPLETION === 'true' &&
    !!env.PAYKEEPER_SERVER_URL && !!env.PAYKEEPER_API_LOGIN &&
    !!env.PAYKEEPER_API_PASSWORD && String(env.PAYKEEPER_SECRET || '').trim().length >= 16;
}

function paymentConfig() {
  return {
    serverUrl: process.env.PAYKEEPER_SERVER_URL,
    secret: String(process.env.PAYKEEPER_SECRET || '').replace(/[\r\n\t]/g, '').trim(),
    apiLogin: process.env.PAYKEEPER_API_LOGIN,
    apiPassword: process.env.PAYKEEPER_API_PASSWORD,
    // Verified against created_datetime/expiry_datetime in the actual merchant.
    providerTimeZone: 'Europe/Moscow'
  };
}

module.exports = { paymentAvailable, paymentConfig };
