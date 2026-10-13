'use strict';

// The existing site has no durable order repository or authenticated invoice API
// integration. A flag/ENV alone MUST NOT enable sales. Wire an audited repository
// and verified provider here only after the release gates in docs/seminar-payment.md.
function paymentAvailable() { return false; }

module.exports = { paymentAvailable };
