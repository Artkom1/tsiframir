'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const root = path.join(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/events.schema.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/events.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(data)) {
  console.error(ajv.errorsText(validate.errors, { separator: '\n' }));
  process.exit(1);
}

const ids = new Set();
const slugs = new Set();
const paymentCodes = new Set();
for (const event of data.events) {
  if (ids.has(event.id) || slugs.has(event.slug) || (event.paymentCode && paymentCodes.has(event.paymentCode))) {
    throw new Error(`Duplicate event identity: ${event.id}`);
  }
  ids.add(event.id);
  slugs.add(event.slug);
  if (event.paymentCode) paymentCodes.add(event.paymentCode);
  if (new Date(event.startDate) > new Date(event.endDate)) throw new Error(`Invalid date range: ${event.id}`);
  if (event.salesOpen && !['upcoming', 'live'].includes(event.status)) throw new Error(`Sales cannot open for ${event.status}: ${event.id}`);
  if (event.salesOpen && (!event.registrationUrl || !event.tariffs.some((tariff) => tariff.enabled))) {
    throw new Error(`Open sales require registrationUrl and an enabled tariff: ${event.id}`);
  }
}

console.log(`Validated ${data.events.length} forum event(s).`);
