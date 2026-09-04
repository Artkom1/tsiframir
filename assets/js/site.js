import { track } from './analytics.js';

document.documentElement.classList.add('js');

const menuButton = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');
function setMenu(open) {
  if (!menuButton || !menu) return;
  menuButton.setAttribute('aria-expanded', String(open));
  menu.classList.toggle('is-open', open);
  document.body.classList.toggle('menu-open', open);
}
menuButton?.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
menu?.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { setMenu(false); menuButton?.focus(); } });
const mobileMenuQuery = window.matchMedia('(max-width: 980px)');
mobileMenuQuery.addEventListener?.('change', (event) => { if (!event.matches) setMenu(false); });

const observer = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
}, { rootMargin: '0px 0px -8% 0px' }) : null;
document.querySelectorAll('[data-reveal]').forEach((element) => observer ? observer.observe(element) : element.classList.add('is-visible'));

const observedCards = new WeakSet();
const cardObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting && !observedCards.has(entry.target)) {
    observedCards.add(entry.target);
    track('event_card_view', { event_id: entry.target.dataset.eventId || 'unknown' });
  }
}, { threshold: .5 }) : null;
function observeEventCards(root = document) {
  root.querySelectorAll?.('[data-event-id]').forEach((card) => cardObserver?.observe(card));
}
observeEventCards();
if (cardObserver && 'MutationObserver' in window) {
  new MutationObserver((mutations) => {
    for (const mutation of mutations) for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches?.('[data-event-id]')) cardObserver.observe(node);
        observeEventCards(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.body.dataset.page === 'archive') track('archive_view', { event_id: 'forum-2026-saint-petersburg' });

const interestForm = document.querySelector('[data-interest-form]');
if (interestForm) {
  const status = interestForm.querySelector('[data-form-status]');
  const submit = interestForm.querySelector('button[type="submit"]');
  const resetStartedAt = () => { interestForm.querySelector('[name="startedAt"]').value = String(Date.now()); };
  resetStartedAt();
  interestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!interestForm.reportValidity()) return;
    submit.disabled = true;
    status.dataset.state = '';
    status.textContent = 'Отправляем…';
    const formData = new FormData(interestForm);
    const payload = Object.fromEntries(formData.entries());
    payload.consent = formData.has('consent');
    try {
      const response = await fetch('/api/forum-interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'request_failed');
      status.dataset.state = 'success';
      status.textContent = 'Спасибо! Мы сообщим, когда появятся подтверждённые сведения о новом форуме.';
      interestForm.reset();
      resetStartedAt();
      track('event_interest_submit', { event_status: 'date_pending' });
    } catch (_) {
      status.dataset.state = 'error';
      status.innerHTML = 'Сейчас отправка недоступна. Напишите нам: <a href="mailto:kisl506@mail.ru?subject=Новый форум ЦифраМир">kisl506@mail.ru</a>.';
    } finally {
      submit.disabled = false;
    }
  });
}
