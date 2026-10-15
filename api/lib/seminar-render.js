'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { EVENT, quote } = require('./seminar-policy');
const { paymentAvailable } = require('./seminar-runtime');
const template = fs.readFileSync(path.join(__dirname, '../templates/seminar.html'), 'utf8');
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const json = data => JSON.stringify(data).replace(/</g, '\\u003c');

function render(now = Date.now()) {
  const q = { ...quote(now), paymentAvailable: paymentAvailable() };
  const canPay = q.salesOpen && q.paymentAvailable;
  const schema = {
    '@context': 'https://schema.org', '@type': 'Event', name: EVENT.title, description: EVENT.description,
    startDate: EVENT.startDate, endDate: EVENT.endDate, eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: 'https://tsiframir.ru/forums/2026-nizhny-novgorod/', image: 'https://tsiframir.ru' + EVENT.heroImage,
    performer: { '@type': 'Person', name: 'Сергей Николаевич Кузнецов' },
    organizer: { '@type': 'Organization', name: 'ЦифраМир', url: 'https://tsiframir.ru/', telephone: ['+79202997772', '+79087305573'] },
    location: { '@type': 'Place', name: 'Маринс Парк Отель / Marins Нижний Новгород', address: {
      '@type': 'PostalAddress', streetAddress: 'ул. Советская, 12', addressLocality: 'Нижний Новгород', addressCountry: 'RU' } }
  };
  if (canPay) schema.offers = { '@type': 'Offer', price: q.amount, priceCurrency: 'RUB', url: schema.url + '#registration',
    availability: 'https://schema.org/InStock', validThrough: q.validUntil };
  const replacements = {
    EVENT_SCHEMA: json(schema), QUOTE: json(q), PRICE: q.amount ? q.amount + ' ₽' : 'Онлайн-продажи закрыты',
    PRICE_UNIT: q.amount ? ' / один участник' : '', CTA: q.salesOpen ? 'Зарегистрироваться и оплатить' : 'Информация об участии',
    LIFECYCLE_HIDDEN: q.status === 'upcoming' ? 'hidden' : '',
    LIFECYCLE: q.status === 'past' ? 'Мастер-класс завершён. Страница сохранена в архиве; онлайн-продажи закрыты.' : q.status === 'live' ? 'Мастер-класс проходит сегодня, 12:00–15:00 по Москве.' : '',
    HERO_IMAGE: escape(EVENT.heroImage), SPEAKER_IMAGE: escape(EVENT.speakerImage), FORM_DISABLED: canPay ? '' : 'disabled',
    PAY_BUTTON: canPay ? 'Оплатить ' + q.amount + ' ₽' : q.salesOpen ? 'Онлайн-оплата временно недоступна' : 'Онлайн-продажи закрыты',
    PAYMENT_NOTICE: canPay ? 'Один билет на одного участника. Перед переходом к оплате стоимость будет проверена ещё раз.' : q.salesOpen ? 'Онлайн-оплата временно недоступна. По вопросам участия свяжитесь с организатором.' : 'Новые заказы не принимаются. По вопросам участия свяжитесь с организатором.',
    SCHEDULE: EVENT.schedule.flatMap(day => day.items).map(item => `<li${/перерыв|кофе-брейк/i.test(item.title) ? ' class="schedule-break"' : ''}><time>${escape(item.time)}</time><p>${escape(item.title)}</p></li>`).join(''),
    TARIFFS: EVENT.tariffs.map(item => `<div class="tariff" data-tariff="${escape(item.code)}" data-current="${q.tariffCode === item.code}"><div>${escape(item.name)}<small class="tariff-marker" data-tariff-marker>${q.tariffCode === item.code ? 'Текущая стоимость' : ''}</small></div><strong>${item.amount} ₽</strong></div>`).join('')
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => replacements[key]);
}
module.exports = { render };
