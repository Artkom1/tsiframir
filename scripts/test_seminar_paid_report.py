#!/usr/bin/env python3
import copy
import argparse
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import seminar_paid_report as report

ORDER = 'TSMNN-20261101-EARLY-11111111-1111-4111-8111-111111111111'
CUTOFF = datetime(2026, 10, 22, 19, tzinfo=report.MOSCOW)
CHATS = [('owner', '10000000001@c.us'), ('sergey', '10000000002@c.us')]


def fixture():
    payment = {'id': '1', 'orderid': ORDER, 'payment_system_id': '30', 'status': 'success',
               'obtain_datetime': '2026-10-22 10:00:00', 'pay_amount': '1800.00', 'refund_amount': '0.00'}
    invoice = {'id': '10', 'orderid': ORDER, 'paymentid': '1', 'status': 'paid', 'pay_amount': '1800.00',
               'service_name': 'Семинар;PKDC|{"eventId":"seminar-2026-nizhny-novgorod"}|'}
    return [payment], [invoice], [{'id': '30', 'is_test': '0'}], {'1': []}


class Accounting(unittest.TestCase):
    def test_payment_time_not_invoice_creation_or_notification(self):
        data = fixture()
        data[1][0]['created_datetime'] = '2026-10-10 10:00:00'
        data[0][0]['success_datetime'] = '2026-10-23 10:00:00'
        result = report.calculate(*data, CUTOFF)
        self.assertEqual((result['paid_orders'], result['today_paid_orders'], result['net_kopecks']), (1, 1, 180000))

    def test_fully_refunded_excluded_from_both_counts(self):
        data = fixture()
        data[0][0].update(status='refunded', refund_amount='1800.00')
        data[3]['1'] = [{'id': '5', 'payment_id': '1', 'amount': '1800.00', 'status': 'done', 'datetime': '2026-10-22 18:00:00'}]
        result = report.calculate(*data, CUTOFF)
        self.assertEqual((result['paid_orders'], result['today_paid_orders'], result['net_kopecks']), (0, 0, 0))
        self.assertEqual(result['today_refund_kopecks'], 180000)

    def test_partial_and_late_refunds_and_negative_daily_net(self):
        data = fixture()
        data[0][0].update(obtain_datetime='2026-10-21 10:00:00', status='partially_refunded', refund_amount='700.00')
        data[3]['1'] = [
            {'id': '5', 'payment_id': '1', 'amount': '500.00', 'status': 'done', 'datetime': '2026-10-22 18:00:00'},
            {'id': '6', 'payment_id': '1', 'amount': '200.00', 'status': 'done', 'datetime': '2026-10-22 20:00:00'},
            {'id': '7', 'payment_id': '1', 'amount': '100.00', 'status': 'started', 'datetime': '2026-10-22 17:00:00'},
        ]
        result = report.calculate(*data, CUTOFF)
        self.assertEqual((result['paid_orders'], result['net_kopecks'], result['today_net_kopecks']), (1, 130000, -50000))

    def test_payment_after_cutoff_excluded(self):
        data = fixture()
        data[0][0]['obtain_datetime'] = '2026-10-22 19:00:01'
        self.assertEqual(report.calculate(*data, CUTOFF)['paid_orders'], 0)

    def test_repeat_callbacks_do_not_multiply_orders(self):
        data = fixture()
        data[0][0]['repeat_counter'] = '99'
        self.assertEqual(report.calculate(*data, CUTOFF)['paid_orders'], 1)
        data[0].append(copy.deepcopy(data[0][0]))
        with self.assertRaisesRegex(report.ReportError, 'DUPLICATE_PAYMENT_ID'):
            report.calculate(*data, CUTOFF)

    def test_same_order_two_distinct_actual_payments_one_order(self):
        data = fixture()
        second = dict(data[0][0], id='2')
        data[0].append(second)
        data[1].append(dict(data[1][0], id='11', paymentid='2'))
        data[3]['2'] = []
        result = report.calculate(*data, CUTOFF)
        self.assertEqual((result['paid_orders'], result['net_kopecks']), (1, 360000))

    def test_excludes_test_gateways_synthetic_orders_unpaid_other_events(self):
        for change in ('gateway', 'synthetic', 'other', 'unpaid'):
            with self.subTest(change=change):
                data = fixture()
                if change == 'gateway':
                    data[2][0]['is_test'] = '1'
                elif change == 'synthetic':
                    data[0][0]['orderid'] = data[1][0]['orderid'] = next(iter(report.TEST_ORDERS))
                elif change == 'other':
                    data[0][0]['orderid'] = data[1][0]['orderid'] = 'OTHER-EVENT'
                else:
                    data[0][0]['status'] = 'pending'
                    data[1].clear()
                self.assertEqual(report.calculate(*data, CUTOFF)['net_kopecks'], 0)

    def test_bool_test_mode_fails_closed(self):
        data = fixture()
        data[2][0]['is_test'] = True
        with self.assertRaisesRegex(report.ReportError, 'UNKNOWN_PAYMENT_SYSTEM_MODE'):
            report.calculate(*data, CUTOFF)

    def test_missing_or_malformed_data_fails_closed(self):
        for field, value in [('obtain_datetime', None), ('pay_amount', 1800.1), ('refund_amount', '100.00')]:
            with self.subTest(field=field):
                data = fixture()
                data[0][0][field] = value
                with self.assertRaises(report.ReportError):
                    report.calculate(*data, CUTOFF)
        data = fixture()
        with self.assertRaisesRegex(report.ReportError, 'PAID_INVOICE_PAYMENT_MISSING'):
            report.calculate([], data[1], data[2], {}, CUTOFF)


class Enumeration(unittest.TestCase):
    def test_full_pagination_even_if_provider_caps_page_size(self):
        calls = []
        def api(path, params):
            calls.append((path, params))
            if path == 'count':
                return {'fullcount': [{'count': '3'}]}
            offset = dict(params)['from']
            return [{'id': str(offset + 1)}] if offset < 3 else []
        self.assertEqual(len(report.enumerate_rows(api, 'list', 'count', [])), 3)
        self.assertEqual(len(calls), 6)

    def test_zero_count_rechecked_without_invalid_empty_provider_list(self):
        calls = []
        def api(path, params):
            calls.append(path)
            self.assertEqual(path, 'count')
            return {'fullcount': [{'count': '0'}]}
        self.assertEqual(report.enumerate_rows(api, 'list', 'count', []), [])
        self.assertEqual(calls, ['count', 'count'])

    def test_overlap_and_count_change_fail(self):
        def api(path, params):
            return {'fullcount': [{'count': '2'}]} if path == 'count' else [{'id': '1'}]
        with self.assertRaisesRegex(report.ReportError, 'OVERLAPPING'):
            report.enumerate_rows(api, 'list', 'count', [])
        responses = iter([{'fullcount': [{'count': '1'}]}, [{'id': '1'}], [], {'fullcount': [{'count': '2'}]}])
        with self.assertRaisesRegex(report.ReportError, 'COUNT_MISMATCH'):
            report.enumerate_rows(lambda *_: next(responses), 'list', 'count', [])

    def test_permission_error_never_becomes_zero(self):
        env = {'PAYKEEPER_SERVER_URL': 'https://tsiframir.server.paykeeper.ru', 'PAYKEEPER_API_LOGIN': 'dummy', 'PAYKEEPER_API_PASSWORD': 'dummy'}
        with patch.object(report, 'http_json', return_value=(200, {'result': 'fail', 'error_code': 312})) as request:
            with self.assertRaisesRegex(report.ReportError, 'PAYKEEPER_READ_PERMISSION_REQUIRED'):
                report.collect(report.PayKeeper(env), CUTOFF)
            self.assertEqual(request.call_count, 1)


class FakeGreen:
    def __init__(self, uncertain=False, pending=False):
        self.sends = []
        self.uncertain, self.pending = uncertain, pending
    def send(self, chat, message):
        self.sends.append(chat)
        if self.uncertain and chat == CHATS[0][1]:
            raise TimeoutError()
        return 'MESSAGE' + chat[:11]
    def verify(self, *args):
        if self.pending:
            raise report.ReportError('GREEN_CONFIRMATION_PENDING')
        return 'sent'


class DurableDelivery(unittest.TestCase):
    def test_failed_data_read_creates_no_snapshot_or_send_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = argparse.Namespace(mode='send-test', state_dir=tmp)
            env = {'PAYKEEPER_SERVER_URL': 'https://tsiframir.server.paykeeper.ru',
                   'PAYKEEPER_API_LOGIN': 'dummy', 'PAYKEEPER_API_PASSWORD': 'dummy',
                   'REPORT_OWNER_CHAT_ID': CHATS[0][1], 'REPORT_SERGEY_CHAT_ID': CHATS[1][1],
                   'REPORT_EXISTING_CHATS_VERIFIED': '1'}
            with patch.object(report, 'Green') as green, patch.object(report, 'collect', side_effect=report.ReportError('PAYKEEPER_READ_PERMISSION_REQUIRED')):
                with self.assertRaisesRegex(report.ReportError, 'PAYKEEPER_READ_PERMISSION_REQUIRED'):
                    report.run(args, env)
                green.return_value.send.assert_not_called()
            store = report.Store(Path(tmp))
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM reports').fetchone()[0], 0)
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM deliveries').fetchone()[0], 0)
            store.close()

    def test_restart_does_not_resend_and_snapshots_are_immutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            green = FakeGreen()
            store = report.Store(Path(tmp))
            store.snapshot('test', CHATS, lambda: ('message', {'n': 1}))
            self.assertFalse(any('error' in r for r in report.deliver(store, 'test', CHATS, 'message', green)))
            store.close()
            store = report.Store(Path(tmp))
            self.assertEqual(store.snapshot('test', CHATS, lambda: self.fail('snapshot recomputed')), ('message', {'n': 1}))
            report.deliver(store, 'test', CHATS, 'message', green)
            self.assertEqual(len(green.sends), 2)
            store.close()

    def test_uncertain_first_recipient_never_retried_second_still_sent(self):
        with tempfile.TemporaryDirectory() as tmp:
            green, store = FakeGreen(uncertain=True), report.Store(Path(tmp))
            first = report.deliver(store, 'test', CHATS, 'message', green)
            self.assertIn('error', first[0])
            self.assertEqual(first[1]['status'], 'sent')
            store.close()
            store = report.Store(Path(tmp))
            report.deliver(store, 'test', CHATS, 'message', green)
            self.assertEqual(len(green.sends), 2)
            store.close()

    def test_accepted_pending_verification_retries_read_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            green, store = FakeGreen(pending=True), report.Store(Path(tmp))
            report.deliver(store, 'test', CHATS, 'message', green)
            green.pending = False
            report.deliver(store, 'test', CHATS, 'message', green)
            self.assertEqual(len(green.sends), 2)
            store.close()

    def test_lock_and_pre_post_crash_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = report.Store(Path(tmp))
            with self.assertRaisesRegex(report.ReportError, 'ALREADY_RUNNING'):
                report.Store(Path(tmp))
            store.claim('test', CHATS[0][1])
            store.close()
            store, green = report.Store(Path(tmp)), FakeGreen()
            report.deliver(store, 'test', CHATS[:1], 'message', green)
            self.assertEqual(green.sends, [])
            store.close()

    def test_moscow_schedule_ignores_server_timezone(self):
        now = datetime.fromisoformat('2026-10-22T16:01:00+00:00')
        self.assertEqual(report.daily_cutoff(now), CUTOFF)
        now = datetime.fromisoformat('2026-10-22T15:59:00+00:00')
        self.assertEqual(report.daily_cutoff(now).isoformat(), '2026-10-21T19:00:00+03:00')


if __name__ == '__main__':
    unittest.main()
