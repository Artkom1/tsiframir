const form = document.querySelector('[data-seminar-form]');
const button = form.querySelector('[data-checkout]');
const fields = form.querySelector('[data-registration-fields]');
const status = form.querySelector('[data-checkout-status]');
const notice = form.querySelector('[data-payment-notice]');
let current = JSON.parse(document.getElementById('seminar-quote').textContent);
let needsConfirmation = false;
let busy = false;
let timer;
let refreshPromise;
const RECEIPT_KEY = 'tsiframir-seminar-20261101-receipt';
const receipt = form.querySelector('[data-receipt]');
const receiptText = form.querySelector('[data-receipt-text]');
const receiptButton = form.querySelector('[data-receipt-check]');
let statusBusy = false;

function savedReceipt() {
  try { return sessionStorage.getItem(RECEIPT_KEY); } catch (_) { return null; }
}

function message(text, focus = false) {
  status.textContent = text;
  if (focus) status.focus();
}

function display(next) {
  const changed = current.amount !== null && next.amount !== null && current.amount !== next.amount;
  if (changed) needsConfirmation = true;
  current = next;
  const price = next.amount === null ? 'Онлайн-продажи закрыты' : `${next.amount} ₽`;
  document.querySelectorAll('[data-current-price], [data-form-price]').forEach(node => { node.textContent = price; });
  document.querySelectorAll('[data-price-unit]').forEach(node => { node.textContent = next.amount === null ? '' : ' / один участник'; });
  document.querySelectorAll('[data-tariff]').forEach(node => {
    const active = node.dataset.tariff === next.tariffCode;
    node.dataset.current = String(active);
    node.querySelector('[data-tariff-marker]').textContent = active ? 'Текущая стоимость' : '';
  });
  const existingOrder = Boolean(savedReceipt());
  const canPay = next.salesOpen && next.paymentAvailable && !existingOrder;
  fields.disabled = !canPay;
  button.disabled = busy || !canPay;
  button.textContent = existingOrder ? 'Заказ уже создан — проверьте оплату ниже' : !next.salesOpen ? 'Онлайн-продажи закрыты' : !next.paymentAvailable ? 'Онлайн-оплата временно недоступна' :
    needsConfirmation ? `Подтвердить ${next.amount} ₽ и оплатить` : `Оплатить ${next.amount} ₽`;
  notice.textContent = existingOrder ? 'Проверьте статус существующего заказа ниже. Перед повторной оплатой или покупкой ещё одного билета свяжитесь с организатором.' :
    !next.salesOpen ? 'Новые заказы не принимаются. По вопросам участия свяжитесь с организатором.' :
    !next.paymentAvailable ? 'Онлайн-оплата временно недоступна. По вопросам участия свяжитесь с организатором.' :
      'Один билет на одного участника. Перед переходом к оплате стоимость будет проверена ещё раз.';
  const banner = document.querySelector('[data-lifecycle]');
  banner.hidden = next.status === 'upcoming';
  banner.textContent = next.status === 'past' ? 'Мастер-класс завершён. Страница сохранена в архиве; онлайн-продажи закрыты.' :
    next.status === 'live' ? 'Мастер-класс проходит сегодня, 12:00–15:00 по Москве.' : '';
  document.querySelector('[data-registration-link]').textContent = next.salesOpen ? 'Зарегистрироваться и оплатить' : 'Информация об участии';
  if (changed) message(`Стоимость изменилась: теперь ${next.amount} ₽ за одного участника. Подтвердите новую сумму отдельным нажатием кнопки.`, true);
  clearTimeout(timer);
  // Delay is derived exclusively from two server timestamps, not device time.
  if (next.nextTransitionAt) timer = setTimeout(() => refresh().catch(unavailable), Math.max(1000,
    Math.min(Date.parse(next.nextTransitionAt) - Date.parse(next.serverTime) + 100, 6 * 60 * 60_000)));
  return changed;
}

function unavailable() {
  button.disabled = true;
  message('Не удалось проверить текущую стоимость. Обновите страницу или свяжитесь с организатором.');
}

function submitPayment(result, amount) {
  if (savedReceipt()) throw new Error('existing_order');
  if (result.amount !== amount || result.quantity !== 1 ||
      !/^https:\/\/tsiframir\.server\.paykeeper\.ru\/bill\/\d{10,32}$/.test(result.invoiceUrl) ||
      typeof result.statusToken !== 'string' || result.statusToken.length > 1024 ||
      !/^[\w-]+\.[\w-]{43}$/.test(result.statusToken)) throw new Error('invalid_payment');
  // Store the opaque, signed receipt capability before leaving. No contacts,
  // signature keys or caller-controlled amounts are in the navigation URL.
  sessionStorage.setItem(RECEIPT_KEY, result.statusToken);
  window.location.assign(result.invoiceUrl);
}

async function checkReceipt() {
  if (statusBusy) return;
  const token = savedReceipt();
  if (!token) return;
  statusBusy = true;
  receipt.hidden = false;
  receiptButton.disabled = true;
  receiptText.textContent = 'Проверяем оплату…';
  try {
    const response = await fetch('/api/seminar-status', { method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusToken: token }) });
    const result = await response.json();
    if (!response.ok || !result.ok || !['paid', 'pending', 'expired'].includes(result.state)) throw new Error('status_unavailable');
    receiptText.textContent = result.state === 'paid' ?
      `Оплата подтверждена. Заказ ${result.orderId}. Один участник, ${result.amount} ₽. Код богатства — мастер-класс ЦифраМир — 1 ноября 2026, 12:00–15:00 МСК. Маринс Парк Отель, Нижний Новгород, ул. Советская, 12. Сохраните номер заказа.` :
      result.state === 'expired' ? `Заказ ${result.orderId}: срок действия счёта истёк, оплата пока не подтверждена. Уже начатая банковская оплата ещё может завершиться. Проверьте статус повторно или свяжитесь с организатором перед повторной оплатой.` :
        `Заказ ${result.orderId}: оплата пока не подтверждена. Если вы уже оплатили, проверьте статус ещё раз через несколько секунд.`;
  } catch (_) {
    receiptText.textContent = 'Сейчас не удалось проверить оплату. Возврат на эту страницу не подтверждает платёж. Проверьте статус позже или свяжитесь с организатором.';
  } finally { statusBusy = false; receiptButton.disabled = false; }
}
receiptButton.addEventListener('click', checkReceipt);

async function refresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const response = await fetch('/api/seminar-quote', { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('quote_unavailable');
    const next = await response.json();
    if (next.eventId !== current.eventId || !['upcoming', 'live', 'past'].includes(next.status) ||
        typeof next.salesOpen !== 'boolean' || typeof next.paymentAvailable !== 'boolean' ||
        (next.salesOpen && ![1600, 1800, 2000].includes(next.amount))) throw new Error('invalid_quote');
    display(next);
    return next;
  })();
  try { return await refreshPromise; } finally { refreshPromise = null; }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || savedReceipt() || !current.salesOpen || !current.paymentAvailable) return;
  if (!form.reportValidity()) return;
  const displayedAmount = current.amount;
  busy = true;
  button.disabled = true;
  button.textContent = 'Проверяем стоимость…';
  try {
    const latest = await refresh();
    if (!latest.salesOpen || !latest.paymentAvailable || latest.amount !== displayedAmount) return;
    // Either the original displayed price is unchanged or this click explicitly
    // accepted the updated amount shown on the confirmation button.
    needsConfirmation = false;
    const response = await fetch('/api/seminar-checkout', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: latest.eventId, name: form.elements.name.value,
        email: form.elements.email.value, phone: form.elements.phone.value,
        consent: form.elements.consent.checked, expectedAmount: displayedAmount })
    });
    const result = await response.json();
    if (response.status === 409 && result.error === 'price_changed') {
      display({ ...result.quote, paymentAvailable: latest.paymentAvailable });
      return;
    }
    if (!response.ok || !result.ok) {
      message(response.status === 410 ? 'Онлайн-продажи закрыты.' : response.status === 400 ?
        'Проверьте данные участника и согласие с условиями.' : 'Оплата сейчас недоступна. Заказ не подтверждён. Свяжитесь с организатором.', true);
      return;
    }
    submitPayment(result, displayedAmount);
  } catch (_) {
    message('Не удалось перейти к оплате. Заказ не подтверждён. Попробуйте позднее или свяжитесь с организатором.', true);
  } finally {
    busy = false;
    display(current);
  }
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) { refresh().catch(unavailable); checkReceipt(); } });
window.addEventListener('pageshow', () => { refresh().catch(unavailable); checkReceipt(); });
display(current);
refresh().catch(unavailable);
checkReceipt();
