'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'public-dist');
const publicEntries = [
  'assets',
  'forums',
  'img',
  'tools',
  'index.html',
  'offer.html',
  'payment-result.html',
  'privacy.html',
  'requisites.html',
  'robots.txt',
  'sitemap.xml',
  'CNAME',
  '.nojekyll'
];

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

for (const entry of publicEntries) {
  const source = path.join(projectRoot, entry);
  if (!fs.existsSync(source)) {
    throw new Error(`Required public entry is missing: ${entry}`);
  }
  fs.cpSync(source, path.join(outputDirectory, entry), { recursive: true });
}

for (const internalAsset of [
  'assets/js/calculators/README.md',
  'assets/js/calculators/calculator-test.js'
]) {
  fs.rmSync(path.join(outputDirectory, internalAsset), { force: true });
}

console.log(`Prepared ${publicEntries.length} public entries in ${outputDirectory}`);
