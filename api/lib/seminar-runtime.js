'use strict';

// The existing merchant supports native HTML payments with the current secret.
// Mandatory signature enforcement, fiscal settings, bank-session expiry and
// provider confirmation/ledger are not yet verified. An ENV flag alone MUST NOT
// open sales. Complete the native-flow gates in SEMINAR_PAYMENT.md first.
function paymentAvailable() { return false; }

function paymentConfig() {
  return {
    serverUrl: process.env.PAYKEEPER_SERVER_URL,
    secret: String(process.env.PAYKEEPER_SECRET || '').replace(/[\r\n\t]/g, '').trim(),
    // Set only after reading the existing account's timezone in its cabinet.
    // A missing zone prevents payment preparation even if availability changes.
    providerTimeZone: null
  };
}

module.exports = { paymentAvailable, paymentConfig };
