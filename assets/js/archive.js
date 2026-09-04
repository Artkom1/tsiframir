import { getEvent } from './events.js';

const scheduleRoot = document.querySelector('#archive-schedule');
const speakersRoot = document.querySelector('#archive-speakers');

function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

try {
  const [event, speakerResponse] = await Promise.all([
    getEvent('forum-2026-saint-petersburg'), fetch('/assets/data/speakers.json')
  ]);
  if (!event || !speakerResponse.ok) throw new Error('archive_data_unavailable');
  const speakerData = await speakerResponse.json();
  if (event.status !== 'past') throw new Error('archive_event_invalid');

  scheduleRoot.replaceChildren(...event.schedule.map((day) => {
    const article = document.createElement('article'); article.className = 'schedule-day';
    article.append(text('h3', day.label));
    const list = document.createElement('ol'); list.className = 'schedule';
    for (const item of day.items) { const li = document.createElement('li'); li.append(text('time', item.time), text('span', item.title)); list.append(li); }
    article.append(list); return article;
  }));

  const byId = new Map(speakerData.speakers.map((speaker) => [speaker.id, speaker]));
  speakersRoot.replaceChildren(...event.speakers.map((id) => {
    const speaker = byId.get(id); if (!speaker) return document.createDocumentFragment();
    const article = document.createElement('article'); article.className = 'speaker-card';
    const image = document.createElement('img'); image.src = '/' + speaker.photo; image.alt = speaker.name; image.loading = 'lazy'; image.width = 320; image.height = 320;
    const copy = document.createElement('div'); copy.className = 'speaker-card-copy'; copy.append(text('h3', speaker.name));
    article.append(image, copy); return article;
  }));
} catch (_) {
  scheduleRoot.innerHTML = '<div class="materials-state"><p>Архивная программа временно недоступна. Попробуйте обновить страницу позднее.</p></div>';
  speakersRoot.innerHTML = '<div class="materials-state"><p>Список спикеров временно недоступен. Попробуйте обновить страницу позднее.</p></div>';
}
