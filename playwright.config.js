const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:4174',
    headless: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run build && PORT=4174 node scripts/serve-production.js',
    url: 'http://127.0.0.1:4174/',
    reuseExistingServer: false
  },
  reporter: [['list']]
});
