'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const { createServer } = require('../../scripts/serve-production');
const { EVENT_ID } = require('../../api/lib/seminar-policy');

test.describe('protected organizer registry using the production HTTP adapter', () => {
  test.describe.configure({ mode: 'serial' });
  let server, base, originalFetch, oldEnv;
  const credentials = { username: 'synthetic-organizer', password: 'synthetic-browser-password' };
  const rawCode = '  МиРa-А  ';
  test.beforeAll(async () => {
    oldEnv = { ...process.env };
    Object.assign(process.env, { PAYKEEPER_SERVER_URL: 'https://tsiframir.server.paykeeper.ru', PAYKEEPER_API_LOGIN: credentials.username, PAYKEEPER_API_PASSWORD: credentials.password });
    const invoices = [rawCode, '', 'МирА-А'].map((codeWord, i) => ({
      orderid: `TSMNN-20261101-EARLY-00000000-0000-4000-8000-00000000000${i}`,
      clientid: i === 0 ? 'Синтетический участник <script>alert(1)</script>' : 'Тестовый участник',
      client_phone: '+70000000000', client_email: 'synthetic@example.invalid',
      service_name: 'Семинар;PKC|[];PKDC|' + JSON.stringify({ eventId: EVENT_ID, codeWord }) + '|',
      created_datetime: '2026-10-17 12:00:00', expiry_datetime: '2026-10-17 12:15:00',
      pay_amount: '1600.00', status: i === 0 ? 'paid' : 'created',
      paymentid: i === 0 ? '90001' : null, paid_datetime: i === 0 ? '2026-10-17 12:01:00' : null
    }));
    originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (String(url).startsWith('https://tsiframir.server.paykeeper.ru/info/invoice/search/')) return { ok: true, json: async () => structuredClone(invoices) };
      return originalFetch(url, options);
    };
    server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/organizer/seminar-orders`;
  });
  test.afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    global.fetch = originalFetch;
    for (const key of ['PAYKEEPER_SERVER_URL', 'PAYKEEPER_API_LOGIN', 'PAYKEEPER_API_PASSWORD']) {
      if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
    }
  });
  test('UI and CSV require authorization, including direct and .js route variants', async ({ request }) => {
    for (const url of [base, base + '.js', base + '/']) {
      const r = await request.get(url); expect(r.status()).toBe(401);
      expect(r.headers()['cache-control']).toContain('no-store');
      expect(await r.text()).not.toContain('synthetic@example.invalid');
    }
    const csv = await request.post(base, { form: { action: 'csv' } });
    expect(csv.status()).toBe(401); expect(await csv.text()).not.toContain('МиР');
  });
  test('organizer reads raw code, filters paid/code/blank and downloads all fields on mobile and desktop', async ({ browser }, info) => {
    const context = await browser.newContext({ httpCredentials: credentials });
    const page = await context.newPage();
    // Production accepts only its HTTPS origins; emulate that header in this local server test.
    await page.route(base, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch({ headers: { ...route.request().headers(), origin: 'https://tsiframir.ru', authorization: 'Basic ' + Buffer.from(credentials.username + ':' + credentials.password).toString('base64') } });
      await route.fulfill({ response });
    });
    await page.goto(base);
    await expect(page.getByRole('heading', { name: 'Заказы семинара 1 ноября' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(3);
    expect(await page.locator('td.code').allTextContents()).toContain(rawCode);
    await expect(page.locator('tbody script')).toHaveCount(0);
    for (const width of [375, 667, 1440]) {
      await page.setViewportSize({ width, height: width === 667 ? 375 : 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`organizer-local-${width}.png`), fullPage: true });
    }
    await page.getByLabel('Промокод / кодовое слово', { exact: true }).fill('мирa-а');
    await page.getByLabel('Только оплаченные').check();
    await page.getByRole('button', { name: 'Показать', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('td.code')).toHaveText(rawCode);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать CSV для Excel' }).click();
    const download = await downloadPromise;
    const content = await fs.readFile(await download.path(), 'utf8');
    expect(content).toContain('Промокод / кодовое слово');
    expect(content).toContain('"' + rawCode + '"');
    expect(content).toContain('"Оплачен"'); expect(content).toContain('"\'+70000000000"');
    expect(content.split('\r\n')).toHaveLength(3);
    expect(content).not.toMatch(/statusToken|invoiceUrl|Basic /);
    await page.reload(); await expect(page.locator('td.code')).toHaveText(rawCode);
    await page.getByRole('link', { name: 'Сбросить' }).click();
    await page.getByLabel('Наличие кода').selectOption('without');
    await page.getByRole('button', { name: 'Показать', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    expect(await page.locator('td.code').textContent()).toBe('');
    await context.close();
  });
});
