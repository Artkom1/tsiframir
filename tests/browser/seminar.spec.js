const { test, expect } = require('@playwright/test');
const { quote } = require('../../api/lib/seminar-policy');
const url = '/forums/2026-nizhny-novgorod/';
const at = time => ({ ...quote(Date.parse(time)), paymentAvailable: true });

for (const width of [375, 768, 1440]) test(`seminar layout, resources and keyboard at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.url().startsWith('http://127.0.0.1:4174') && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.goto(url); await expect(page.locator('h1')).toHaveText('Число π и система ЦифраМир');
  await expect(page.locator('[data-checkout]')).toBeDisabled();
  await expect(page.locator('[data-payment-notice]')).toContainText('Онлайн-оплата временно недоступна');
  await expect(page.locator('.schedule li')).toHaveCount(8);
  await expect(page.locator('#speaker img')).toHaveJSProperty('naturalWidth', 361);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
  expect(await page.locator('.skip-link').evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
  await expect(page.locator('h1')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.locator('.skip-link').evaluate(node => node.blur());
  await page.screenshot({ path: `/home/mikhail/tsiframir-seminar-evidence-20261013/seminar-local-${width}.png`, fullPage: true });
  expect(failures).toEqual([]);
});

test('server price survives arbitrary browser clock and timezone', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Pacific/Honolulu' }); const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2030-01-01T00:00:00Z'));
  await page.goto(url); await expect(page.locator('[data-current-price]')).toHaveText(`${quote().amount} ₽`);
  await context.close();
});

test('old tab requires explicit updated amount confirmation and never sends contact in URL', async ({ page }) => {
  let current = at('2026-10-25T23:59:30+03:00'), calls = [];
  await page.route('**/api/seminar-quote', route => route.fulfill({ json: current }));
  await page.route('**/api/seminar-checkout', route => { calls.push({ body: route.request().postDataJSON(), url: route.request().url() }); return route.fulfill({ status: 503, json: { ok: false, error: 'payment_temporarily_unavailable' } }); });
  await page.goto(url); await expect(page.locator('[data-checkout]')).toBeEnabled();
  await page.getByLabel('Имя', { exact: true }).fill('Тестовый Участник'); await page.getByLabel('Email', { exact: true }).fill('test@example.invalid'); await page.locator('[name=consent]').check();
  current = at('2026-10-26T00:00:00+03:00');
  await page.locator('[data-checkout]').click(); await expect(page.locator('[data-checkout-status]')).toContainText('Стоимость изменилась');
  expect(calls).toHaveLength(0); await expect(page.locator('[data-checkout]')).toHaveText('Подтвердить 1800 ₽ и оплатить');
  await page.locator('[data-checkout]').click(); await expect(page.locator('[data-checkout-status]')).toContainText('Заказ не подтверждён');
  expect(calls).toHaveLength(1); expect(calls[0].body.expectedAmount).toBe(1800); expect(calls[0].url).not.toMatch(/test%40|test@|name=|email=/);
});

test('form validation and checkout-side price race require another explicit click', async ({ page }) => {
  let current = at('2026-10-25T23:59:30+03:00'), calls = 0;
  await page.route('**/api/seminar-quote', route => route.fulfill({ json: current }));
  await page.route('**/api/seminar-checkout', route => { calls++; current = at('2026-10-26T00:00:00+03:00'); return route.fulfill({ status: 409, json: { ok: false, error: 'price_changed', quote: current } }); });
  await page.goto(url); await expect(page.locator('[data-checkout]')).toBeEnabled();
  await page.locator('[data-checkout]').click(); await expect(page.locator('#participant-name')).toBeFocused(); expect(calls).toBe(0);
  await page.getByLabel('Имя', { exact: true }).fill('Тестовый Участник'); await page.getByLabel('Email', { exact: true }).fill('test@example.invalid'); await page.locator('[name=consent]').check();
  await page.locator('[data-checkout]').click(); await expect(page.locator('[data-checkout]')).toHaveText('Подтвердить 1800 ₽ и оплатить'); expect(calls).toBe(1);
});

test('visibility refresh closes sales, and success URL does not certify a payment', async ({ page }) => {
  let current = at('2026-11-01T12:00:00+03:00');
  await page.route('**/api/seminar-quote', route => route.fulfill({ json: current }));
  await page.goto(url); await expect(page.locator('[data-checkout]')).toBeEnabled();
  current = at('2026-11-01T18:00:00+03:00');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('[data-checkout]')).toBeDisabled(); await expect(page.locator('[data-lifecycle]')).toContainText('Семинар завершён');
  for (const query of ['', '?result=success&payment_id=forged', '?result=fail&payment_id=forged', '?success=true&paid=1&orderId=forged']) {
    await page.goto('/payment-result.html' + query);
    await expect(page.locator('#state-unknown')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Уточните статус оплаты');
    await expect(page.locator('#state-success')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('forged');
    await expect(page.locator('body')).not.toContainText('Платёж принят');
    await expect(page.locator('body')).not.toContainText('Подтверждение придёт');
  }
});

test('a visible tab refreshes upcoming to live at noon from server timestamps', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
  let current = at('2026-11-01T11:59:59+03:00');
  await page.route('**/api/seminar-quote', route => route.fulfill({ json: current }));
  await page.goto(url); await expect(page.locator('[data-current-price]')).toHaveText('2000 ₽');
  await expect(page.locator('[data-lifecycle]')).toBeHidden();
  current = at('2026-11-01T12:00:00+03:00');
  await page.clock.fastForward(1200);
  await expect(page.locator('[data-lifecycle]')).toContainText('Семинар проходит сегодня');
  await expect(page.locator('[data-checkout]')).toBeEnabled();
});

test('native checkout sends signed fields by POST only to the existing merchant', async ({ page }) => {
  const { prepareHtmlPayment } = require('../../api/lib/seminar-paykeeper-html');
  const now = Date.parse('2026-10-25T23:55:00+03:00');
  const body = { eventId: 'seminar-2026-nizhny-novgorod', name: 'Тестовый Участник', email: 'test@example.invalid', phone: '+0 (000) 000-00-00', consent: true, expectedAmount: 1600 };
  const payload = prepareHtmlPayment(body, { serverUrl: 'tsiframir.server.paykeeper.ru', secret: 'test-only', providerTimeZone: 'Europe/Moscow' }, now);
  await page.route('**/api/seminar-quote', route => route.fulfill({ json: { ...quote(now), paymentAvailable: true } }));
  await page.route('**/api/seminar-checkout', route => {
    expect(route.request().postDataJSON()).toEqual(body);
    return route.fulfill({ json: payload });
  });
  let posted;
  await page.route('https://tsiframir.server.paykeeper.ru/**', route => {
    posted = { method: route.request().method(), url: route.request().url(), fields: Object.fromEntries(new URLSearchParams(route.request().postData())) };
    return route.fulfill({ contentType: 'text/html', body: '<title>Provider test double</title>' });
  });
  await page.goto(url); await expect(page.locator('[data-checkout]')).toBeEnabled();
  await page.getByLabel('Имя', { exact: true }).fill(body.name); await page.getByLabel('Email', { exact: true }).fill(body.email); await page.locator('[name=consent]').check();
  await page.getByLabel('Телефон (необязательно)', { exact: true }).fill(body.phone);
  await page.locator('[data-checkout]').click(); await page.waitForURL(payload.action);
  expect(posted.method).toBe('POST'); expect(posted.url).toBe(payload.action); expect(posted.fields).toEqual(payload.fields);
  expect(posted.url).not.toMatch(/name=|email=|test@|phone=|000-00/);
  expect(JSON.parse(posted.fields.cart)[0]).toMatchObject({ quantity: 1, price: 1600, sum: 1600, tax: 'none' });
});

test('native checkout refuses a substituted merchant URL', async ({ page }) => {
  const { prepareHtmlPayment } = require('../../api/lib/seminar-paykeeper-html');
  const now = Date.parse('2026-10-25T23:55:00+03:00');
  const body = { eventId: 'seminar-2026-nizhny-novgorod', name: 'Тестовый Участник', email: 'test@example.invalid', consent: true, expectedAmount: 1600 };
  const payload = prepareHtmlPayment(body, { serverUrl: 'tsiframir.server.paykeeper.ru', secret: 'test-only', providerTimeZone: 'Europe/Moscow' }, now);
  await page.route('**/api/seminar-quote', route => route.fulfill({ json: { ...quote(now), paymentAvailable: true } }));
  await page.route('**/api/seminar-checkout', route => route.fulfill({ json: { ...payload, action: 'https://another.paykeeper.ru/create/' } }));
  await page.goto(url); await expect(page.locator('[data-checkout]')).toBeEnabled();
  await page.getByLabel('Имя', { exact: true }).fill(body.name); await page.getByLabel('Email', { exact: true }).fill(body.email); await page.locator('[name=consent]').check();
  await page.locator('[data-checkout]').click(); await expect(page.locator('[data-checkout-status]')).toContainText('Не удалось перейти к оплате');
  expect(new URL(page.url()).pathname).toBe(url);
});
