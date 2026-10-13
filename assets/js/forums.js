import { eventPath, formatEventDates, getPublicEvents } from './events.js';

const upcomingRoot = document.querySelector('[data-upcoming-events]');
const pastRoot = document.querySelector('[data-past-events]');

function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function eventCard(event) {
  const article = document.createElement('article');
  article.className = 'forum-card';
  article.dataset.eventId = event.id;
  const image = document.createElement('div');
  image.className = 'forum-card-image';
  image.setAttribute('role', 'img');
  image.setAttribute('aria-label', `Фирменная графика события «${event.edition}»`);
  if (event.heroImage) image.style.backgroundImage = `url("${event.heroImage.replace(/["\\]/g, '')}")`;
  const copy = document.createElement('div');
  copy.className = 'forum-card-copy';
  const isPast = event.status === 'past';
  const kind = event.type === 'seminar' ? 'Семинар' : 'Форум';
  const statusLabel = isPast ? `${kind} прошёл` : event.status === 'cancelled' ? `${kind} отменён` : event.status === 'live' ? 'Проходит сейчас' : 'Предстоящее событие';
  const status = text('span', statusLabel, `tag ${isPast ? 'tag-past' : ''}`);
  const details = text('p', `${event.city || 'Место уточняется'} · ${formatEventDates(event)}${event.venue ? `\n${event.venue}` : ''}`, 'preserve-lines');
  const link = text('a', isPast && event.type !== 'seminar' ? 'Программа и состав спикеров →' : 'Открыть событие →', 'text-link');
  link.href = eventPath(event);
  copy.append(status, text('h3', event.edition), details, link);
  article.append(image, copy);
  return article;
}

async function update() { try {
  const events = await getPublicEvents();
  const upcoming = events.filter((event) => event.status === 'upcoming' || event.status === 'live');
  const past = events.filter((event) => event.status === 'past' || event.status === 'cancelled');
  upcomingRoot.replaceChildren(...(upcoming.length ? upcoming.map(eventCard) : [text('p', 'Новые встречи появятся здесь после подтверждения.', 'materials-state')]));
  pastRoot.replaceChildren(...(past.length ? past.map(eventCard) : [text('p', 'Архив пока пуст.', 'materials-state')]));
} catch (_) {
  pastRoot.replaceChildren(text('p', 'Архив событий временно недоступен. Попробуйте обновить страницу позднее.', 'materials-state'));
}
}
update();
document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
