const EVENTS_URL = '/assets/data/events.json';
const PUBLIC_STATUSES = new Set(['upcoming', 'live', 'past', 'cancelled']);
let eventPromise;

export async function loadEvents() {
  eventPromise ||= fetch(EVENTS_URL, { headers: { Accept: 'application/json' } }).then(async (response) => {
    if (!response.ok) throw new Error('event_data_unavailable');
    const data = await response.json();
    if (!data || !Array.isArray(data.events)) throw new Error('event_data_invalid');
    return data.events;
  });
  return eventPromise;
}

export async function getPublicEvents() {
  return (await loadEvents()).filter((event) => PUBLIC_STATUSES.has(event.status));
}

export async function getEvent(eventId) {
  return (await getPublicEvents()).find((event) => event.id === eventId) || null;
}

export function eventPath(event) { return `/forums/${encodeURIComponent(event.slug)}/`; }

export function formatEventDates(event) {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const formatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
  if (start.toDateString() === end.toDateString()) return formatter.format(start);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return sameMonth ? `${start.getDate()}–${formatter.format(end)}` : `${formatter.format(start)} — ${formatter.format(end)}`;
}
