#!/usr/bin/env python3
"""Root-only first installation of a reviewed, pre-verified standalone bundle.

Invoke from the extracted git archive: python3 ops/seminar-paid-report/install_disabled.py SHA
The deployment operator must verify archive hash and review exact SHA beforehand.
This installer never enables a timer, sends a message, or changes the app release.
"""
import json
import fcntl
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile


def command(*args):
    return subprocess.run(args, text=True, capture_output=True, check=False)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2 or not re.fullmatch(r'[a-f0-9]{40}', sys.argv[1]):
        raise RuntimeError('ROOT_AND_REVIEWED_SHA_REQUIRED')
    sha = sys.argv[1]
    source = Path(__file__).resolve().parents[2]
    app = Path('/opt/tsiframir-site/current').resolve()
    if app.name != '0429ee04bff985f8a28da45e2b3ab11bd3470de5':
        raise RuntimeError('APP_BASE_CHANGED_REVIEW_REQUIRED')
    for unit in ('tsiframir-paid-report.timer', 'tsiframir-paid-report.service'):
        if command('systemctl', 'is-active', '--quiet', unit).returncode == 0:
            raise RuntimeError('EXISTING_REPORT_ACTIVE')
        if command('systemctl', 'is-enabled', '--quiet', unit).returncode == 0:
            raise RuntimeError('EXISTING_REPORT_ENABLED')
        target = Path('/etc/systemd/system') / unit
        if target.exists() and target.read_bytes() != (source / 'ops/seminar-paid-report' / unit).read_bytes():
            raise RuntimeError('EXISTING_UNIT_DIFFERS')
    paths = (
        'scripts/seminar_paid_report.py', 'scripts/test_seminar_paid_report.py',
        'ops/seminar-paid-report/README.md', 'ops/seminar-paid-report/install_disabled.py',
        'ops/seminar-paid-report/tsiframir-paid-report.service',
        'ops/seminar-paid-report/tsiframir-paid-report.timer',
    )
    root = Path('/opt/tsiframir-site/reports')
    releases = root / 'releases'
    releases.mkdir(parents=True, exist_ok=True)
    release = releases / sha
    if release.exists():
        for name in paths:
            if (release / name).read_bytes() != (source / name).read_bytes():
                raise RuntimeError('IMMUTABLE_RELEASE_MISMATCH')
    else:
        temp = Path(tempfile.mkdtemp(prefix='.install-', dir=releases))
        try:
            for name in paths:
                target = temp / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((source / name).read_bytes())
                target.chmod(0o444)
            for directory, _, _ in os.walk(temp, topdown=False):
                Path(directory).chmod(0o555)
            temp.rename(release)
        except Exception:
            shutil.rmtree(temp)
            raise
    current_new = root / '.current-new'
    if current_new.exists() or current_new.is_symlink():
        raise RuntimeError('INSTALL_LINK_ALREADY_EXISTS')
    current_new.symlink_to(release)
    current_new.replace(root / 'current')
    for unit in ('tsiframir-paid-report.service', 'tsiframir-paid-report.timer'):
        target = Path('/etc/systemd/system') / unit
        data = (release / 'ops/seminar-paid-report' / unit).read_bytes()
        if target.exists() and target.read_bytes() != data:
            raise RuntimeError('EXISTING_UNIT_DIFFERS')
        target.write_bytes(data)
        target.chmod(0o644)
    env_path = Path('/etc/tsiframir-site/paid-report.env')
    if not env_path.exists():
        keys = {'PAYKEEPER_SERVER_URL', 'PAYKEEPER_API_LOGIN', 'PAYKEEPER_API_PASSWORD'}
        values = {}
        for line in Path('/etc/tsiframir-site/site.env').read_text().splitlines():
            match = re.match(r'^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)$', line)
            if match and match[1] in keys:
                parsed = shlex.split(match[2], comments=True)
                if len(parsed) != 1 or match[1] in values or '\n' in parsed[0] or '\r' in parsed[0]:
                    raise RuntimeError('INVALID_EXISTING_CONFIG')
                values[match[1]] = parsed[0]
        if set(values) != keys:
            raise RuntimeError('MISSING_EXISTING_CONFIG')
        values['REPORT_START_DATE'] = '2026-10-22'
        # systemd EnvironmentFile supports quoted values; never shell-source this file.
        body = ''.join(key + '=' + json.dumps(value, ensure_ascii=False) + '\n' for key, value in values.items())
        fd = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
    result = command('systemctl', 'daemon-reload')
    if result.returncode:
        raise RuntimeError('SYSTEMD_RELOAD_FAILED')
    if Path('/opt/tsiframir-site/current').resolve() != app:
        raise RuntimeError('APP_RELEASE_CHANGED')
    print(json.dumps({'release': str(release), 'timer': 'installed_disabled', 'app_release': app.name,
                      'credential_file': str(env_path), 'messages_sent': 0}))


if __name__ == '__main__':
    try:
        with open('/run/lock/tsiframir-site-deploy.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            main()
    except Exception:
        print(json.dumps({'error': 'DISABLED_INSTALL_FAILED'}), file=sys.stderr)
        sys.exit(1)
