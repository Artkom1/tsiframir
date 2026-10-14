#!/usr/bin/env python3
"""One-time authorized same-owner migration; secrets never touch local disk/logs."""
import json
import subprocess
import sys
import requests

sys.path.insert(0, '/home/mikhail/tsiframir-incident-20261013T051608Z')
from vercel_readonly import PROJECT, TEAM, session_headers

REQUIRED = {'PAYKEEPER_SERVER_URL', 'PAYKEEPER_SECRET', 'PAYKEEPER_API_LOGIN', 'PAYKEEPER_API_PASSWORD'}
# AI remains on the existing backend; its credential is not needed on this VPS.
OPTIONAL = {'FORUM_INTEREST_WEBHOOK_URL'}

def main():
    headers = session_headers()
    response = requests.get(f'https://vercel.com/api/v10/projects/{PROJECT}/env',
                            params={'teamId': TEAM}, headers=headers, timeout=30)
    response.raise_for_status()
    values = {}
    for item in response.json()['envs']:
        if item['key'] not in REQUIRED | OPTIONAL or 'production' not in item.get('target', []):
            continue
        if item['key'] in values:
            raise RuntimeError('Ambiguous production environment')
        detail = requests.get(f'https://vercel.com/api/v1/projects/{PROJECT}/env/{item["id"]}',
                              params={'teamId': TEAM}, headers=headers, timeout=30)
        detail.raise_for_status()
        values[item['key']] = detail.json()['value']
    if not REQUIRED.issubset(values) or not all(values[k] for k in REQUIRED):
        raise RuntimeError('Required environment is incomplete')
    # Existing handlers accept this exact merchant with or without https://.
    if values['PAYKEEPER_SERVER_URL'].rstrip('/') not in {
        'https://tsiframir.server.paykeeper.ru', 'tsiframir.server.paykeeper.ru'
    }:
        raise RuntimeError('Unexpected merchant')
    values['PAYKEEPER_SEMINAR_ALLOW_STARTED_PAYMENT_COMPLETION'] = 'true'
    # systemd EnvironmentFile double-quote escaping; reject control characters.
    lines = []
    for key, value in values.items():
        if not isinstance(value, str) or any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
            raise RuntimeError('Unsupported environment encoding')
        escaped = value.replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$')
        lines.append(key + '="' + escaped + '"\n')
    remote = "umask 077; test ! -e /etc/tsiframir-site/site.env && cat > /etc/tsiframir-site/site.env && chmod 600 /etc/tsiframir-site/site.env"
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-i', '/home/mikhail/.ssh/flowrealty_vps', 'root@201.51.29.219', remote],
        input=''.join(lines), text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Remote environment installation failed; no sensitive output displayed')
    print(json.dumps({'installed': True, 'required_complete': True, 'optional_count': len(OPTIONAL & values.keys()), 'mode': '0600'}))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Environment migration failed; no credential details displayed', file=sys.stderr)
        sys.exit(1)
