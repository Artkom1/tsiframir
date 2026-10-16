# Seminar registration and tariff update — 2026-10-16

Base live release / rollback: `95276c72528c753ead5bcc73295d68fe7c8b894c`. Branch: `feature/tsiframir-seminar-registration-20261016`. Existing VPS, PayKeeper merchant, credentials, return URL, signed receipts, expiry and sales-close policy remain in use.

## Behavior

The supplied hero headline and subheading replace the previous copy. The nearby date, 12:00–15:00 Moscow time, Nizhny Novgorod venue, current price and registration CTA remain visible. Required name and phone, optional code word and required email appear in that order. Client/server field errors preserve values and identify the first invalid control. Code word is trimmed, limited to 100 characters and stored with the durable PayKeeper invoice in its JSON `custom_data`; it grants no discount. Name, phone and email retain their existing provider fields.

Canonical event tariffs in Europe/Moscow: 1600 through October25; 1800 from October26; 3000 from November1 until the unchanged November1 15:00 sales close. Server quote, rendered price/schema, invoice/cart and confirmation use the same amount. Previously signed 2000-ruble receipts and authenticated historical callbacks remain accepted; no new 2000-ruble invoice is issued. Existing amount reconfirmation and prevention of duplicate orders while a saved receipt is unresolved remain intact.

## Release gates and evidence

Evidence and reviewed helpers: `/home/mikhail/tsiframir-seminar-registration-evidence-20261016/`.

1. Early fresh Astra xhigh read-only review, then scoped server and browser checks. Freeze a clean commit; fresh independent Astra xhigh final review of that exact commit and release helpers, concurrent with one complete `npm test`, `npm run test:browser` (includes production build), exact-commit archive packaging and preservation check. Any source edit expires review.
2. Record the deployed base, all installed file hashes, original dirty checkout, app response, nginx PID and eight configuration hashes. Preserve runtime, root-owned environment0600, loopback8093, service user and memory cap.
3. Push the reviewed feature branch. Package only tracked `api`, `assets/data/events.json`, verified `public-dist`, production server scripts and package.json. Verify every byte against HEAD and reject archive links/unsafe paths. Deploy to a new root-owned release directory, atomically switch current and restart only `tsiframir-site.service`. Roll back to the base above if health/quote/protected-host checks fail.
4. Verify public TLS pages, exact CSS/JS/image bytes, form and hero at320/375/768/1440, all existing key routes, no network/console errors or overflow, invalid API submissions and forged receipt rejection. Compare installed manifest, app, nginx/configurations and original dirty checkout again.
5. One synthetic unpaid invoice through the deployed checkout may verify the existing real PayKeeper integration, contact fields, code-word persistence, amount and expiry. Read back that invoice only; do not send it, open a bank session, mark it paid, or move money. Revoke only the invoice created by this check, and confirm no payment ID/paid timestamp. Credentials and receipt tokens stay in process memory; reports contain only redacted assertions and the synthetic order identity.

Provider contract: https://docs.paykeeper.ru/dokumentatsiya-json-api/scheta/ (`preview`, invoice-by-id, `custom_data`, `revoke`). Real future-date bank settlement and pre-debit expiry enforcement cannot be proved without a bank transaction; retain the owner's existing started-payment-completion setting. Historical pending orders are not evidence of payment.

The exact final commit, review verdict, tests, deployment and public verification are recorded in the post-completion final report, outside this pre-release runbook.
