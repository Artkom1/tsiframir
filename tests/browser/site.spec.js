const { test, expect } = require('@playwright/test');

const publicPages = [
  ['home', '/', 'https://tsiframir.ru/'],
  ['forums', '/forums/', 'https://tsiframir.ru/forums/'],
  ['archive', '/forums/2026-saint-petersburg/', 'https://tsiframir.ru/forums/2026-saint-petersburg/'],
  ['tools', '/tools/', 'https://tsiframir.ru/tools/']
];

for (const [name, route, canonical] of publicPages) {
  test(`${name} loads without browser or internal resource errors`, async ({ page }) => {
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).origin === 'http://127.0.0.1:4174') errors.push(`request: ${request.url()}`);
    });
    page.on('response', (response) => {
      if (new URL(response.url()).origin === 'http://127.0.0.1:4174' && response.status() >= 400) {
        errors.push(`response ${response.status()}: ${response.url()}`);
      }
    });

    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description.trim().length).toBeGreaterThan(40);
    expect(await page.locator('h1').count()).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('home is a permanent brand hub and its primary CTA opens a working calculation', async ({ page }) => {
  await page.addInitScript(() => {
    window.gtagCalls = [];
    window.gtag = (...args) => window.gtagCalls.push(args);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('система понимания человека через числа');
  await expect(page.locator('body')).not.toContainText(/купить билет|65 из 100|осталось только 35|ранняя цена/i);
  await page.getByRole('link', { name: 'Рассчитать свою матрицу' }).click();
  await expect(page).toHaveURL(/\/tools\/$/);
  await expect(page.locator('.module-tab')).toHaveCount(7);
  await page.locator('input[name="day"]').fill('4');
  await page.locator('input[name="month"]').fill('9');
  await page.locator('input[name="year"]').fill('1990');
  await page.getByRole('button', { name: 'Рассчитать' }).click();
  await expect(page.locator('.result-area')).not.toContainText('Заполните форму');
  const calculationEvents = await page.evaluate(() => window.gtagCalls.filter((entry) => entry[0] === 'event'));
  expect(calculationEvents).toEqual([
    ['event', 'calculator_start', { calculator_id: 'birthDate' }],
    ['event', 'calculator_complete', { calculator_id: 'birthDate' }]
  ]);
  expect(JSON.stringify(calculationEvents)).not.toContain('1990');
});

test('calculator labels and validation errors are exposed to assistive technology', async ({ page }) => {
  await page.goto('/tools/');
  await page.locator('.module-tab[data-calculator="compatibility"]').click();

  for (const fieldName of ['person1Data', 'person2Data']) {
    const input = page.locator(`.calculator-form input[name="${fieldName}"]`);
    const inputId = await input.getAttribute('id');
    expect(inputId).toBeTruthy();
    await expect(page.locator(`label[for="${inputId}"]`)).toBeVisible();

    const describedBy = (await input.getAttribute('aria-describedby')).split(/\s+/);
    const error = page.locator(`[data-field="${fieldName}"]`);
    expect(describedBy).toContain(await error.getAttribute('id'));
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(input).toHaveAttribute('aria-invalid', 'false');
  }

  const firstPerson = page.locator('input[name="person1Data"]');
  await firstPerson.fill('неверный формат');
  await page.locator('input[name="person2Data"]').fill('15.03.1985 Иванова Анна Сергеевна');
  await page.getByRole('button', { name: 'Рассчитать совместимость' }).click();
  await expect(firstPerson).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-field="person1Data"]')).toBeVisible();

  await firstPerson.fill('30.07.1982 Петров Иван Иванович');
  await expect(firstPerson).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('[data-field="person1Data"]')).toBeHidden();
});

test('analytics fallback sends one safe event and strips personal parameters', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    window.dataLayer = [];
    window.gtag = undefined;
    window.tsiframirTrack('contact_click', { location: 'test', email: 'private@example.invalid', phone: '+70000000000' });
    return window.dataLayer;
  });
  expect(result).toEqual([{ event: 'contact_click', location: 'test' }]);
});

test('forum catalogue links to a closed archive with historical content', async ({ page }) => {
  await page.goto('/forums/');
  await page.getByRole('link', { name: /Программа и состав спикеров/ }).click();
  await expect(page).toHaveURL(/\/forums\/2026-saint-petersburg\/$/);
  await expect(page.getByText('Форум прошёл', { exact: true }).first()).toBeVisible();
  await expect(page.locator('#archive-schedule .schedule-day')).toHaveCount(2);
  expect(await page.locator('#archive-speakers .speaker-card').count()).toBeGreaterThan(10);
  await expect(page.locator('body')).not.toContainText(/купить билет|забронировать|осталось.*мест/i);
  await expect(page.locator('a[href*="paykeeper"], form[action*="paykeeper"]')).toHaveCount(0);
});

test('mobile menu is operable with keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.locator('[data-menu-toggle]');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-menu]')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('mobile menu remains usable in landscape and releases its scroll lock on resize', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/');
  const toggle = page.locator('[data-menu-toggle]');
  await toggle.click();
  const menu = page.locator('[data-menu]');
  await expect(menu).toHaveCSS('overflow-y', 'auto');
  await expect(menu.getByRole('link', { name: 'Контакты' })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 375 });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('body')).not.toHaveClass(/menu-open/);
});

test('Escape does not steal focus while the menu is closed', async ({ page }) => {
  await page.goto('/forums/');
  const email = page.locator('#interest-email');
  await email.focus();
  await page.keyboard.press('Escape');
  await expect(email).toBeFocused();
});

test('forum dates stay on Moscow calendar dates in other browser time zones', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Pacific/Honolulu' });
  const page = await context.newPage();
  await page.goto('/forums/');
  await expect(page.locator('[data-past-events]')).toContainText(/13.*14 июня 2026/);
  await context.close();
});

test('interest form reports success and emits no personal analytics data', async ({ page }) => {
  await page.route('**/api/forum-interest', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto('/forums/');
  await page.locator('#interest-name').fill('Тест');
  await page.locator('#interest-email').fill('test@example.invalid');
  await page.locator('[name="consent"]').check();
  await page.getByRole('button', { name: 'Сообщить о новом форуме' }).click();
  await expect(page.locator('[data-form-status]')).toContainText('Спасибо');
  const events = await page.evaluate(() => window.dataLayer || []);
  const submitEvent = events.find((item) => item.event === 'event_interest_submit');
  expect(submitEvent).toEqual({ event: 'event_interest_submit', event_status: 'date_pending' });
  await expect(page.locator('[name="startedAt"]')).not.toHaveValue('');
});

test('interest form has an honest recoverable error state', async ({ page }) => {
  await page.route('**/api/forum-interest', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"error":"delivery_not_configured"}' }));
  await page.goto('/forums/');
  await page.locator('#interest-email').fill('test@example.invalid');
  await page.locator('[name="consent"]').check();
  await page.getByRole('button', { name: 'Сообщить о новом форуме' }).click();
  await expect(page.locator('[data-form-status]')).toContainText('Сейчас отправка недоступна');
  await expect(page.locator('[data-form-status] a[href^="mailto:"]')).toBeVisible();
});
