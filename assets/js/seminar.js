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
  const canPay = next.salesOpen && next.paymentAvailable;
  fields.disabled = !canPay;
  button.disabled = busy || !canPay;
  button.textContent = !next.salesOpen ? 'Онлайн-продажи закрыты' : !next.paymentAvailable ? 'Онлайн-оплата временно недоступна' :
    needsConfirmation ? `Подтвердить ${next.amount} ₽ и оплатить` : `Оплатить ${next.amount} ₽`;
  notice.textContent = !next.salesOpen ? 'Новые заказы не принимаются. По вопросам участия свяжитесь с организатором.' :
    !next.paymentAvailable ? 'Онлайн-оплата временно недоступна. По вопросам участия свяжитесь с организатором.' :
      'Один билет на одного участника. Перед переходом к оплате стоимость будет проверена ещё раз.';
  const banner = document.querySelector('[data-lifecycle]');
  banner.hidden = next.status === 'upcoming';
  banner.textContent = next.status === 'past' ? 'Семинар завершён. Страница сохранена в архиве; онлайн-продажи закрыты.' :
    next.status === 'live' ? 'Семинар проходит сегодня, 12:00–18:00 по Москве.' : '';
  document.querySelector('[data-registration-link]').textContent = next.salesOpen ? 'Зарегистрироваться и оплатить' : 'Информация об участии';
  if (changed) message(`Стоимость изменилась: теперь ${next.amount} ₽ за одного участника. Подтвердите новую сумму отдельным нажатием кнопки.`, true);
  clearTimeout(timer);
  // Delay is derived exclusively from two server timestamps, not device time.
  if (next.salesOpen) timer = setTimeout(() => refresh().catch(unavailable), Math.max(1000,
    Math.min(Date.parse(next.validUntil) - Date.parse(next.serverTime) + 100, 6 * 60 * 60_000)));
  return changed;
}

function unavailable() {
  button.disabled = true;
  message('Не удалось проверить текущую стоимость. Обновите страницу или свяжитесь с организатором.');
}

function submitPayment(result, amount) {
  const names = ['sum', 'clientid', 'orderid', 'service_name', 'client_email', 'client_phone', 'expiry', 'sign'];
  if (result.method !== 'POST' || result.action !== 'https://tsiframir.server.paykeeper.ru/create/' ||
      result.amount !== amount || result.eventId !== current.eventId || !result.fields ||
      Object.keys(result.fields).length !== names.length ||
      !names.every(name => typeof result.fields[name] === 'string') ||
      result.fields.sum !== amount.toFixed(2) || result.fields.orderid !== result.orderId ||
      !/^TSMNN-20261101-[A-Z_]+-[a-f0-9-]{36}$/.test(result.orderId) ||
      !/^[a-f0-9]{64}$/.test(result.fields.sign)) throw new Error('invalid_payment');
  const paymentForm = document.createElement('form');
  paymentForm.method = 'POST'; paymentForm.action = result.action; paymentForm.hidden = true;
  for (const name of names) {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = result.fields[name];
    paymentForm.append(input);
  }
  document.body.append(paymentForm);
  // POST keeps participant details out of the URL. Never render provider fields
  // as markup or interpret a return URL as evidence of payment.
  HTMLFormElement.prototype.submit.call(paymentForm);
}

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
  if (busy || !current.salesOpen || !current.paymentAvailable) return;
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
        email: form.elements.email.value, consent: form.elements.consent.checked, expectedAmount: displayedAmount })
    });
    const result = await response.json();
    if (response.status === 409 && result.error === 'price_changed') {
      display({ ...result.quote, paymentAvailable: latest.paymentAvailable });
      return;
    }
    if (!response.ok || !result.ok) {
      message(response.status === 410 ? 'Онлайн-продажи закрыты.' : response.status === 400 ?
        'Проверьте имя, email и согласие с условиями.' : 'Оплата сейчас недоступна. Заказ не подтверждён. Свяжитесь с организатором.', true);
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

document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) refresh().catch(unavailable); });
window.addEventListener('pageshow', () => refresh().catch(unavailable));
display(current);
refresh().catch(unavailable);
