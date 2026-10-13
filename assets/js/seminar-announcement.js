import { getEvent } from './events.js';
const root = document.querySelector('[data-seminar-announcement]');
async function update() {
  try {
    const event = await getEvent('seminar-2026-nizhny-novgorod');
    if (!root || !event) return;
    root.querySelector('[data-announcement-state]').textContent = event.status === 'past' ? 'Семинар прошёл' : event.status === 'live' ? 'Встречаемся сегодня' : 'Ближайшая встреча';
    root.querySelector('[data-announcement-link]').textContent = event.status === 'past' ? 'Открыть страницу семинара' : 'Программа и участие';
  } catch (_) { /* The static announcement still links to the authoritative page. */ }
}
update();
document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
