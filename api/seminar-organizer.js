'use strict';
const crypto = require('node:crypto');
const { paymentConfig } = require('./lib/seminar-runtime');
const { readOrders, filterOrders, csv, COLUMNS, STATUS } = require('./lib/seminar-registry');
const PATH = '/organizer/seminar-orders';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digest = value => crypto.createHash('sha256').update(value).digest();

function authorized(header, config) {
  if (!config.apiLogin || !config.apiPassword || typeof header !== 'string' || header.length > 2048 || !/^Basic [A-Za-z0-9+/]+={0,2}$/.test(header)) return false;
  const supplied = Buffer.from(header.slice(6), 'base64');
  const expected = Buffer.from(config.apiLogin + ':' + config.apiPassword);
  return crypto.timingSafeEqual(digest(supplied), digest(expected));
}

function page(orders, filters, total) {
  const headers = COLUMNS.map(([, label]) => `<th scope="col">${esc(label)}</th>`).join('');
  const rows = orders.map(order => '<tr>' + COLUMNS.map(([key]) => `<td${key === 'codeWord' ? ' class="code"' : ''}>${esc(key === 'status' ? STATUS[order.status] : order[key])}</td>`).join('') + '</tr>').join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Заказы семинара — ЦифраМир</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#182235;font:16px/1.5 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:24px}h1{font-size:28px;margin:0 0 8px}p{max-width:85ch}form{display:flex;flex-wrap:wrap;gap:16px;align-items:end;padding:20px;background:white;border:1px solid #c4cbd5;border-radius:8px}label{display:block}form>div:first-child{width:340px;max-width:100%}form small{display:block}input[type=text],select,button,a.button{min-height:44px;font:inherit;padding:8px 12px;border:1px solid #637087;border-radius:4px}input[type=text]{width:min(100%,340px)}input[type=checkbox]{width:20px;height:20px;vertical-align:middle}.check{display:flex;align-items:center;gap:8px;min-height:44px}button{cursor:pointer;background:#193a63;color:white}a{color:#193a63}a.button{display:inline-block;text-decoration:none;background:#fff}:focus-visible{outline:3px solid #c36a00;outline-offset:3px}.table-wrap{overflow-x:auto;border:1px solid #c4cbd5;background:#fff}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:12px;border-bottom:1px solid #c4cbd5;vertical-align:top}th{background:#e5ebf3}td{min-width:130px;max-width:350px;overflow-wrap:anywhere}.code{white-space:pre-wrap;min-width:200px}small{font-size:14px}@media(max-width:600px){main{padding:16px}h1{font-size:24px}form{padding:16px}form>div{width:100%}input[type=text]{width:100%}}
  </style></head><body><main><h1>Заказы семинара 1 ноября</h1><p>Нижний Новгород · Код богатства · время по Москве. Кодовое слово показывает источник регистрации и не меняет цену.</p>
  <form action="${PATH}" method="post"><div><label for="code">Промокод / кодовое слово</label><input id="code" name="code" type="text" maxlength="100" value="${esc(filters.code)}" placeholder="Полностью или часть слова"><small>Поиск без учёта регистра; исходное написание сохранено.</small></div>
  <div><label for="codeState">Наличие кода</label><select id="codeState" name="codeState">${[['all', 'Все заказы'], ['with', 'С кодом'], ['without', 'Без кода']].map(([value, label]) => `<option value="${value}"${filters.codeState === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
  <label class="check"><input name="paid" type="checkbox" value="1"${filters.paid ? ' checked' : ''}>Только оплаченные</label><button name="action" value="view">Показать</button><button name="action" value="csv">Скачать CSV для Excel</button><a class="button" href="${PATH}">Сбросить</a></form>
  <p role="status">Показано: ${orders.length} из ${total}. Выгрузка учитывает выбранные фильтры. Для полной выгрузки сбросьте фильтры.</p>
  <div class="table-wrap" tabindex="0" role="region" aria-label="Заказы, таблица прокручивается по горизонтали"><table><caption>Регистрации и оплата</caption><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td colspan="${COLUMNS.length}">Заказов по выбранным условиям нет.</td></tr>`}</tbody></table></div>
  <p><small>Обновите страницу, чтобы увидеть текущую оплату. CSV: UTF-8, разделитель «;». Для безопасности Excel значения, похожие на формулы, начинаются с апострофа. В заказе хранится исходное значение.</small></p></main></body></html>`;
}

function createHandler({ config = paymentConfig, read = readOrders, now = Date.now } = {}) {
  // Bounded, ephemeral throttle only; never an order or credential store.
  const attempts = new Map();
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const settings = config();
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
    const time = now();
    for (const [key, entry] of attempts) if (entry.until <= time) attempts.delete(key);
    if (attempts.get(ip)?.count >= 10) { res.setHeader('Retry-After', '60'); return res.status(429).send('Повторите вход через минуту.'); }
    if (!authorized(req.headers?.authorization, settings)) {
      const entry = attempts.get(ip) || { count: 0, until: time + 60_000 };
      entry.count++;
      if (attempts.size < 2048 || attempts.has(ip)) attempts.set(ip, entry);
      res.setHeader('WWW-Authenticate', 'Basic realm="TsifraMir organizer", charset="UTF-8"');
      return res.status(401).send('Войдите с действующим логином и паролем PayKeeper организатора.');
    }
    attempts.delete(ip);
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).send('Method Not Allowed'); }
    if (req.headers?.['sec-fetch-site'] === 'cross-site' || (req.headers?.origin && !['https://tsiframir.ru', 'https://www.tsiframir.ru'].includes(req.headers.origin))) return res.status(403).send('Forbidden');
    if (req.method === 'POST' && String(req.headers?.['content-type'] || '').split(';')[0] !== 'application/x-www-form-urlencoded') return res.status(415).send('Form required');
    const body = req.method === 'POST' ? req.body : {};
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['action', 'code', 'paid', 'codeState'].includes(k)) ||
        (body.code !== undefined && (typeof body.code !== 'string' || body.code.length > 100 || /[\x00-\x1f\x7f]/.test(body.code))) ||
        (body.paid !== undefined && body.paid !== '1') || (body.codeState !== undefined && !['all', 'with', 'without'].includes(body.codeState)) ||
        (body.action !== undefined && !['view', 'csv'].includes(body.action))) return res.status(400).send('Некорректный фильтр.');
    const filters = { code: body.code || '', paid: body.paid === '1', codeState: body.codeState || 'all' };
    try {
      const orders = await read(settings);
      const selected = filterOrders(orders, filters);
      if (body.action === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="seminar-2026-nizhny-novgorod-orders.csv"');
        return res.status(200).send(csv(selected));
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(page(selected, filters, orders.length));
    } catch (_) {
      return res.status(503).send('Не удалось загрузить заказы. Обновите страницу позже.');
    }
  };
}
module.exports = createHandler();
module.exports._test = { createHandler, authorized, page };
