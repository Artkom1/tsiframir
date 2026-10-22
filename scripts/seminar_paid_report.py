#!/usr/bin/env python3
"""Read-only PayKeeper accounting and durable WhatsApp delivery for one seminar.

Python 3.9+, standard library only. Never prints provider bodies, URLs or secrets.
"""
import argparse
import base64
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlsplit
from zoneinfo import ZoneInfo

MOSCOW = ZoneInfo('Europe/Moscow')
EVENT = 'seminar-2026-nizhny-novgorod'
ORDER = re.compile(r'TSMNN-20261101-(EARLY|STANDARD|EVENT_DAY)-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
TEST_ORDERS = frozenset({
    'TSMNN-20261101-EARLY-3e753b27-79bf-4456-9d08-dbe1c438a12a',
    'TSMNN-20261101-EARLY-7eb6dc2f-271e-407a-ba90-38003a13d278',
    'TSMNN-20261101-EARLY-685daa7a-2691-4836-8ff5-5ecb599bee5a',
})
STATUSES = ('pending', 'obtained', 'canceled', 'success', 'failed', 'stuck',
            'refunded', 'refunding', 'partially_refunded')
PAID = frozenset(STATUSES) - {'pending', 'canceled', 'failed'}


class ReportError(Exception):
    """Only fixed non-sensitive codes are allowed in this exception."""


def require(condition, code):
    if not condition:
        raise ReportError(code)


def money(value):
    require(isinstance(value, (str, int)) and not isinstance(value, bool), 'INVALID_MONEY')
    value = str(value)
    require(re.fullmatch(r'\d{1,12}(?:\.\d{1,2})?', value), 'INVALID_MONEY')
    whole, _, fraction = value.partition('.')
    return int(whole) * 100 + int((fraction + '00')[:2])


def provider_date(value):
    require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}', value), 'INVALID_PROVIDER_DATE')
    try:
        return datetime.strptime(value, '%Y-%m-%d %H:%M:%S').replace(tzinfo=MOSCOW)
    except ValueError:
        raise ReportError('INVALID_PROVIDER_DATE') from None


def numeric_id(value):
    require(isinstance(value, (str, int)) and re.fullmatch(r'[0-9]+', str(value)), 'INVALID_PROVIDER_ID')
    return str(value)


def event_metadata(service):
    require(isinstance(service, str), 'INVALID_EVENT_METADATA')
    try:
        if service.startswith('{'):
            data = json.loads(service)['custom_data']
            data = json.loads(data) if isinstance(data, str) else data
        else:
            require(';PKDC|' in service and service.endswith('|'), 'INVALID_EVENT_METADATA')
            data = json.loads(service.split(';PKDC|', 1)[1][:-1])
        require(isinstance(data, dict) and data.get('eventId') == EVENT, 'INVALID_EVENT_METADATA')
        return data
    except (ValueError, KeyError, TypeError):
        raise ReportError('INVALID_EVENT_METADATA') from None


def fullcount(data):
    # The documentation shows both a composite object and an array of objects.
    if isinstance(data, list):
        parts = [p['fullcount'] for p in data if isinstance(p, dict) and 'fullcount' in p]
        require(len(parts) == 1, 'INVALID_COUNT')
        value = parts[0]
    else:
        require(isinstance(data, dict) and 'fullcount' in data, 'INVALID_COUNT')
        value = data['fullcount']
    require(isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict), 'INVALID_COUNT')
    return int(numeric_id(value[0].get('count')))


def enumerate_rows(api, list_path, count_path, params, page_size=100):
    before = fullcount(api(count_path, params))
    require(before <= 100000, 'REGISTRY_TOO_LARGE')
    rows = []
    seen = set()
    # Stop at the independently read count: the merchant's empty invoice page is
    # not valid JSON. Short nonempty pages still advance by their actual length.
    while len(rows) < before:
        page = api(list_path, params + [('from', len(rows)), ('limit', page_size)])
        require(isinstance(page, list), 'INVALID_REGISTRY_PAGE')
        if not page:
            break
        require(len(rows) + len(page) <= before, 'REGISTRY_CHANGED')
        for row in page:
            require(isinstance(row, dict), 'INVALID_REGISTRY_ROW')
            key = numeric_id(row.get('id'))
            require(key not in seen, 'OVERLAPPING_REGISTRY_PAGES')
            seen.add(key)
            rows.append(row)
    after = fullcount(api(count_path, params))
    require(before == after == len(rows), 'REGISTRY_COUNT_MISMATCH')
    return rows


def calculate(payments, invoices, systems, refunds_by_id, cutoff):
    require(cutoff.tzinfo is not None, 'INVALID_CUTOFF')
    cutoff = cutoff.astimezone(MOSCOW)
    day_start = cutoff.replace(hour=0, minute=0, second=0, microsecond=0)
    system_tests = {}
    for system in systems:
        sid = numeric_id(system.get('id'))
        require(sid not in system_tests, 'DUPLICATE_PAYMENT_SYSTEM_ID')
        require(type(system.get('is_test')) in (str, int) and system.get('is_test') in ('0', '1', 0, 1), 'UNKNOWN_PAYMENT_SYSTEM_MODE')
        system_tests[sid] = str(system['is_test']) == '1'
    known_invoices = {}
    for invoice in invoices:
        order = invoice.get('orderid')
        if not isinstance(order, str) or not ORDER.fullmatch(order) or order in TEST_ORDERS:
            continue
        event_metadata(invoice.get('service_name'))
        require(invoice.get('status') == 'paid', 'INVOICE_NOT_PAID')
        key = numeric_id(invoice.get('paymentid'))
        require(key not in known_invoices or known_invoices[key]['orderid'] == order, 'CONFLICTING_INVOICES')
        known_invoices[key] = invoice
    orders, today_orders, payment_ids, refund_ids = {}, set(), set(), set()
    gross = today_gross = refunded = today_refunded = refund_count = today_refund_count = 0
    target_payment_ids = set()
    for payment in payments:
        key = numeric_id(payment.get('id'))
        require(key not in payment_ids, 'DUPLICATE_PAYMENT_ID')
        payment_ids.add(key)
        order = payment.get('orderid')
        if not isinstance(order, str) or not ORDER.fullmatch(order) or order in TEST_ORDERS:
            continue
        sid = numeric_id(payment.get('payment_system_id'))
        require(sid in system_tests, 'UNKNOWN_PAYMENT_SYSTEM')
        if system_tests[sid]:
            continue
        status = payment.get('status')
        require(status in STATUSES, 'UNKNOWN_PAYMENT_STATUS')
        if status not in PAID:
            continue
        target_payment_ids.add(key)
        require(key in known_invoices and known_invoices[key]['orderid'] == order, 'PAYMENT_INVOICE_MISMATCH')
        paid_at = provider_date(payment.get('obtain_datetime'))
        amount = money(payment.get('pay_amount'))
        require(amount > 0 and money(known_invoices[key].get('pay_amount')) == amount, 'PAYMENT_AMOUNT_MISMATCH')
        require(key in refunds_by_id and isinstance(refunds_by_id[key], list), 'MISSING_REFUND_LEDGER')
        current_refunds = asof_refunds = 0
        for refund in refunds_by_id[key]:
            rid = numeric_id(refund.get('id'))
            require(rid not in refund_ids and numeric_id(refund.get('payment_id')) == key, 'INVALID_REFUND_ID')
            refund_ids.add(rid)
            require(refund.get('status') in ('started', 'done', 'failed'), 'UNKNOWN_REFUND_STATUS')
            if refund['status'] != 'done':
                continue
            value = money(refund.get('amount'))
            at = provider_date(refund.get('datetime'))
            require(at >= paid_at and value > 0, 'INVALID_REFUND')
            current_refunds += value
            if at <= cutoff:
                asof_refunds += value
                refund_count += 1
                if at >= day_start:
                    today_refunded += value
                    today_refund_count += 1
        require(current_refunds == money(payment.get('refund_amount')) and current_refunds <= amount, 'REFUND_RECONCILIATION_FAILED')
        if paid_at > cutoff:
            continue
        gross += amount
        refunded += asof_refunds
        orders[order] = orders.get(order, 0) + amount - asof_refunds
        if paid_at >= day_start:
            today_orders.add(order)
            today_gross += amount
    # A paid invoice without a payment in the full ledger must never silently vanish.
    for key, invoice in known_invoices.items():
        matching = [p for p in payments if str(p.get('id')) == key]
        require(len(matching) == 1, 'PAID_INVOICE_PAYMENT_MISSING')
        p = matching[0]
        sid = numeric_id(p.get('payment_system_id'))
        require(sid in system_tests, 'UNKNOWN_PAYMENT_SYSTEM')
        require(system_tests[sid] or key in target_payment_ids, 'PAID_INVOICE_PAYMENT_UNCONFIRMED')
    return {
        'cutoff': cutoff.isoformat(), 'paid_orders': sum(v > 0 for v in orders.values()),
        'gross_kopecks': gross, 'refund_kopecks': refunded, 'net_kopecks': gross - refunded,
        'today_paid_orders': sum(orders[o] > 0 for o in today_orders), 'today_gross_kopecks': today_gross,
        'refund_count': refund_count, 'today_refund_count': today_refund_count,
        'today_refund_kopecks': today_refunded, 'today_net_kopecks': today_gross - today_refunded,
        'registry_payments': len(payments), 'registry_paid_invoices': len(invoices),
        'matched_payments': len(target_payment_ids), 'synthetic_order_exclusions': len(TEST_ORDERS),
    }


def http_json(host, path, *, headers=None, payload=None):
    connection = http.client.HTTPSConnection(host, timeout=15)
    try:
        body = None if payload is None else json.dumps(payload).encode()
        connection.request('GET' if payload is None else 'POST', path, body, headers or {})
        response = connection.getresponse()
        raw = response.read(8 * 1024 * 1024 + 1)
        require(len(raw) <= 8 * 1024 * 1024, 'PROVIDER_RESPONSE_TOO_LARGE')
        try:
            data = json.loads(raw)
        except (ValueError, UnicodeError):
            raise ReportError('PROVIDER_INVALID_JSON') from None
        return response.status, data
    finally:
        connection.close()


class PayKeeper:
    def __init__(self, env):
        origin = urlsplit(env.get('PAYKEEPER_SERVER_URL', ''))
        require(origin.scheme == 'https' and origin.hostname == 'tsiframir.server.paykeeper.ru'
                and not origin.username and not origin.password and origin.port in (None, 443)
                and origin.path in ('', '/') and not origin.query and not origin.fragment, 'INVALID_PAYKEEPER_ORIGIN')
        auth = env.get('PAYKEEPER_API_LOGIN', '') + ':' + env.get('PAYKEEPER_API_PASSWORD', '')
        require(all(env.get(k) for k in ('PAYKEEPER_API_LOGIN', 'PAYKEEPER_API_PASSWORD')), 'MISSING_PAYKEEPER_CREDENTIALS')
        self.headers = {'Authorization': 'Basic ' + base64.b64encode(auth.encode()).decode(), 'Accept': 'application/json'}

    def __call__(self, path, params=()):
        require(path.startswith('/info/'), 'PAYKEEPER_READ_ONLY')
        for attempt in range(3):
            try:
                status, data = http_json('tsiframir.server.paykeeper.ru', path + '?' + urlencode(params), headers=self.headers)
                if isinstance(data, dict) and data.get('error_code') == 312:
                    raise ReportError('PAYKEEPER_READ_PERMISSION_REQUIRED')
                require(status == 200 and not (isinstance(data, dict) and (data.get('result') == 'fail' or 'error' in data)), 'PAYKEEPER_READ_FAILED')
                return data
            except ReportError as error:
                if str(error) == 'PAYKEEPER_READ_PERMISSION_REQUIRED' or attempt == 2:
                    raise
            except (OSError, http.client.HTTPException):
                if attempt == 2:
                    raise ReportError('PAYKEEPER_TRANSPORT_FAILED') from None
            time.sleep(attempt + 1)


def collect(api, cutoff):
    systems = api('/info/systems/list/')
    require(isinstance(systems, list) and systems, 'MISSING_PAYMENT_SYSTEMS')
    end = (datetime.now(MOSCOW).date() + timedelta(days=1)).isoformat()
    params = [('start', '2026-01-01'), ('end', end)]
    params += [('payment_system_id[]', numeric_id(s.get('id'))) for s in systems]
    params += [('status[]', status) for status in STATUSES]
    payments = enumerate_rows(api, '/info/payments/bydate/', '/info/payments/bydatecount/', params)
    invoices = enumerate_rows(api, '/info/invoice/list/', '/info/invoice/listcount/', [
        ('start_date', '2026-01-01'), ('end_date', end), ('status[]', 'paid')])
    refunds = {}
    for p in payments:
        if isinstance(p.get('orderid'), str) and ORDER.fullmatch(p['orderid']) and p['orderid'] not in TEST_ORDERS and p.get('status') in PAID:
            key = numeric_id(p.get('id'))
            refunds[key] = api('/info/refunds/bypaymentid/', [('id', key)])
    return calculate(payments, invoices, systems, refunds, cutoff)


def format_report(stats, test=False):
    def rub(value):
        return f'{value // 100:,}'.replace(',', ' ') + f',{value % 100:02d} ₽' if value >= 0 else '−' + rub(-value)
    cutoff = datetime.fromisoformat(stats['cutoff']).astimezone(MOSCOW)
    return '\n'.join([
        ('ТЕСТОВЫЙ ОТЧЕТ · реальные данные' if test else 'Ежедневный отчет по оплатам'),
        'Семинар · Нижний Новгород · 1 ноября 2026',
        f'Срез: {cutoff:%d.%m.%Y %H:%M:%S} МСК',
        f'Всего оплаченных заказов: {stats["paid_orders"]}',
        f'Сумма за вычетом возвратов: {rub(stats["net_kopecks"])}',
        f'Все поступления: {rub(stats["gross_kopecks"])}',
        f'Подтвержденные возвраты: {stats["refund_count"]} / {rub(stats["refund_kopecks"])}',
        f'Сегодня 00:00–{cutoff:%H:%M:%S} МСК по времени оплаты:',
        f'Актуальных оплаченных заказов: {stats["today_paid_orders"]}',
        f'Поступления сегодня: {rub(stats["today_gross_kopecks"])}',
        f'Возвраты сегодня: {stats["today_refund_count"]} / {rub(stats["today_refund_kopecks"])}',
        f'Поступления минус возвраты сегодня: {rub(stats["today_net_kopecks"])}',
        'Полностью возвращенные заказы исключены из обоих количеств.',
        'Возвраты сегодня включают возвраты за оплаты прошлых дней.',
    ])


class Green:
    def __init__(self, env):
        origin = urlsplit(env.get('GREEN_API_URL', ''))
        host = origin.hostname or ''
        require(origin.scheme == 'https' and (host in ('api.green-api.com', 'api.greenapi.com')
                or re.fullmatch(r'\d+\.api\.greenapi\.com', host))
                and not origin.username and not origin.password and origin.port in (None, 443)
                and origin.path in ('', '/') and not origin.query and not origin.fragment, 'INVALID_GREEN_ORIGIN')
        instance, token = env.get('GREEN_API_INSTANCE_ID', ''), env.get('GREEN_API_TOKEN', '')
        require(re.fullmatch(r'\d{1,32}', instance) and re.fullmatch(r'[A-Za-z0-9_-]{16,256}', token), 'MISSING_GREEN_CREDENTIALS')
        self.host, self.prefix, self.token = host, '/waInstance' + instance + '/', token

    def request(self, method, payload=None, *, readonly=True):
        require(method in ('getStateInstance', 'getMessage', 'sendMessage'), 'INVALID_GREEN_METHOD')
        require(readonly == (method != 'sendMessage'), 'INVALID_GREEN_RETRY_MODE')
        for attempt in range(3 if readonly else 1):
            try:
                return http_json(self.host, self.prefix + method + '/' + self.token,
                                 headers={'Content-Type': 'application/json', 'Accept': 'application/json'}, payload=payload)
            except (OSError, http.client.HTTPException, ReportError):
                if not readonly or attempt == 2:
                    raise ReportError('GREEN_READ_FAILED' if readonly else 'GREEN_SEND_UNCERTAIN') from None
                time.sleep(attempt + 1)

    def authorized(self):
        status, data = self.request('getStateInstance')
        require(status == 200 and isinstance(data, dict) and data.get('stateInstance') == 'authorized', 'GREEN_NOT_AUTHORIZED')

    def send(self, chat, message):
        status, data = self.request('sendMessage', {'chatId': chat, 'message': message, 'linkPreview': False}, readonly=False)
        # Even a server error may happen after acceptance. Never retry this POST.
        require(status == 200 and isinstance(data, dict) and isinstance(data.get('idMessage'), str)
                and re.fullmatch(r'[A-Za-z0-9_-]{8,128}', data['idMessage']), 'GREEN_SEND_UNCERTAIN')
        return data['idMessage']

    def verify(self, chat, message_id, message):
        status, data = self.request('getMessage', {'chatId': chat, 'idMessage': message_id})
        require(status == 200 and isinstance(data, dict), 'GREEN_CONFIRMATION_PENDING')
        text = data.get('textMessage') or (data.get('extendedTextMessage') or {}).get('text')
        require(data.get('idMessage') == message_id and data.get('chatId') == chat
                and data.get('type') == 'outgoing' and data.get('sendByApi') is True
                and text == message, 'GREEN_CONFIRMATION_PENDING')
        require(data.get('statusMessage') in ('sent', 'delivered', 'read'), 'GREEN_CONFIRMATION_PENDING')
        return data['statusMessage']


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def recipients(env):
    result = [(label, env.get(key, '')) for label, key in (
        ('owner', 'REPORT_OWNER_CHAT_ID'), ('sergey', 'REPORT_SERGEY_CHAT_ID'))]
    require(all(re.fullmatch(r'\d{8,15}@c\.us', chat) for _, chat in result)
            and result[0][1] != result[1][1], 'INVALID_REPORT_RECIPIENTS')
    require(env.get('REPORT_EXISTING_CHATS_VERIFIED') == '1', 'EXISTING_CHATS_NOT_VERIFIED')
    return result


class Store:
    """Kernel lock + synchronous SQLite claim survives process crashes and reboot."""
    def __init__(self, directory):
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.lock = (directory / 'report.lock').open('a')
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            raise ReportError('REPORT_ALREADY_RUNNING') from None
        self.db = sqlite3.connect(directory / 'report.sqlite3')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS reports (
            key TEXT PRIMARY KEY, message TEXT NOT NULL, stats TEXT NOT NULL,
            recipients TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS deliveries (
            key TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL,
            message_id TEXT, error TEXT, PRIMARY KEY(key, recipient));
        ''')

    def close(self):
        self.db.close()
        self.lock.close()

    def snapshot(self, key, chats, build):
        hashes = json.dumps(sorted(digest(chat) for _, chat in chats))
        row = self.db.execute('SELECT message, stats, recipients FROM reports WHERE key=?', (key,)).fetchone()
        if row:
            require(row[2] == hashes, 'REPORT_RECIPIENTS_CHANGED')
            return row[0], json.loads(row[1])
        message, stats = build()
        with self.db:
            self.db.execute('INSERT INTO reports VALUES (?,?,?,?)', (key, message, json.dumps(stats, sort_keys=True), hashes))
        return message, stats

    def delivery(self, key, chat):
        return self.db.execute('SELECT status, message_id, error FROM deliveries WHERE key=? AND recipient=?', (key, digest(chat))).fetchone()

    def claim(self, key, chat):
        with self.db:
            self.db.execute('INSERT INTO deliveries VALUES (?,?,?,NULL,NULL)', (key, digest(chat), 'claimed'))

    def update(self, key, chat, status, message_id=None, error=None):
        with self.db:
            self.db.execute('UPDATE deliveries SET status=?, message_id=?, error=? WHERE key=? AND recipient=?',
                            (status, message_id, error, key, digest(chat)))


def deliver(store, key, chats, message, green):
    results = []
    for label, chat in chats:
        row = store.delivery(key, chat)
        try:
            if row and row[0] == 'confirmed':
                results.append({'recipient': label, 'masked': '***' + chat.split('@')[0][-4:], 'status': 'already_confirmed', 'idMessage': row[1]})
                continue
            if row and row[0] in ('claimed', 'uncertain'):
                raise ReportError('SEND_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED')
            message_id = row[1] if row else None
            if not row:
                store.claim(key, chat)  # Commit BEFORE any sending network request.
                try:
                    message_id = green.send(chat, message)
                except Exception:
                    store.update(key, chat, 'uncertain', error='GREEN_SEND_UNCERTAIN')
                    raise ReportError('GREEN_SEND_UNCERTAIN') from None
                store.update(key, chat, 'accepted', message_id)
            status = green.verify(chat, message_id, message)
            store.update(key, chat, 'confirmed', message_id)
            results.append({'recipient': label, 'masked': '***' + chat.split('@')[0][-4:], 'status': status, 'idMessage': message_id})
        except ReportError as error:
            results.append({'recipient': label, 'masked': '***' + chat.split('@')[0][-4:], 'error': str(error)})
    return results


def daily_cutoff(now):
    now = now.astimezone(MOSCOW)
    cutoff = now.replace(hour=19, minute=0, second=0, microsecond=0)
    return cutoff if now >= cutoff else cutoff - timedelta(days=1)


def run(args, env):
    now = datetime.now(MOSCOW).replace(microsecond=0)
    cutoff = now if args.mode in ('dry-run', 'send-test') else daily_cutoff(now)
    api = PayKeeper(env)
    if args.mode == 'dry-run':
        stats = collect(api, cutoff)
        print(json.dumps({'mode': args.mode, 'stats': stats, 'message': format_report(stats, True)}, ensure_ascii=False))
        return 0
    if args.mode == 'daily':
        try:
            start = datetime.strptime(env.get('REPORT_START_DATE', ''), '%Y-%m-%d').date()
        except ValueError:
            raise ReportError('INVALID_REPORT_START_DATE') from None
        if cutoff.date() < start:
            print(json.dumps({'status': 'not_due'}))
            return 0
    chats = recipients(env)
    green = Green(env)
    key = EVENT + (':test-v1' if args.mode == 'send-test' else ':' + cutoff.date().isoformat())
    store = Store(Path(args.state_dir))
    try:
        def build():
            stats = collect(api, cutoff)
            return format_report(stats, args.mode == 'send-test'), stats
        message, stats = store.snapshot(key, chats, build)
        green.authorized()
        result = deliver(store, key, chats, message, green)
        print(json.dumps({'mode': args.mode, 'stats': stats, 'deliveries': result}, ensure_ascii=False))
        return 1 if any('error' in item for item in result) else 0
    finally:
        store.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=('dry-run', 'send-test', 'daily'), default='dry-run')
    parser.add_argument('--state-dir', default='/var/lib/tsiframir-paid-report')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        return run(args, os.environ)
    except ReportError as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        return 1
    except Exception:
        # Provider bodies, connection URLs and credential values must never enter journals.
        print(json.dumps({'error': 'UNEXPECTED_REPORT_FAILURE'}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
