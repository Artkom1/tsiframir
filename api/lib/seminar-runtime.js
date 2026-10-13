'use strict';

// The existing merchant supports native HTML payments with the current secret.
// Mandatory signature enforcement, fiscal settings, bank-session expiry and
// provider confirmation/ledger are not yet verified. An ENV flag alone MUST NOT
// open sales. Complete the native-flow gates in SEMINAR_PAYMENT.md first.
function paymentAvailable() { return false; }

module.exports = { paymentAvailable };
