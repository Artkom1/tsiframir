# Выпуск `tsiframir.ru` через Vercel

Репозиторий уже связан с существующим Vercel-проектом `numerology-forum-landing`. Этот документ описывает выпуск только публичного сайта `tsiframir.ru`; `app.tsiframir.ru`, Telegram-контур и DNS не входят в процедуру.

## Перед выпуском

```bash
npm ci
npm test
npm run test:browser
vercel build --prod --yes
git status --short
```

Убедитесь, что:

- release-ветка отправлена в `origin` и прошла review;
- текущий production deployment записан как точка возврата;
- переменные окружения уже существуют в Vercel и их значения не выводятся в терминал;
- `FORUM_INTEREST_WEBHOOK_URL` настроен, если требуется серверная доставка заявок.

## Preview и production

Preview по умолчанию:

```bash
./vercel-deploy.sh
```

Production после smoke-теста preview и принятого PR:

```bash
./vercel-deploy.sh --prod
```

Скрипт использует существующую локальную связь `.vercel/project.json` и текущую авторизацию Vercel CLI. Он не запрашивает и не передаёт секреты через аргументы командной строки.

## Smoke-тест

Проверить главную, `/forums/`, архив, `/tools/`, `robots.txt`, `sitemap.xml`, отсутствие ошибок консоли и 404 внутренних ресурсов. POST старого форума на `/api/paykeeper/checkout` должен вернуть `410 event_sales_closed` без обращения к PayKeeper. Форма интереса должна либо доставить заявку, либо честно показать состояние недоступной доставки.

## Rollback

Vercel хранит неизменяемые предыдущие deployments. При подтверждённой production-регрессии используйте штатный rollback/promote в том же Vercel-проекте на записанный предыдущий deployment. Не меняйте DNS и не выпускайте соседние проекты.
