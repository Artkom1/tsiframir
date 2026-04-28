#!/usr/bin/env python3
"""Validate consistency between assets/data/speakers.json and index.html."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEAKERS_JSON = ROOT / "assets" / "data" / "speakers.json"
INDEX_HTML = ROOT / "index.html"

errors = []
warnings = []


def fail(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


if not SPEAKERS_JSON.exists():
    fail(f"missing file: {SPEAKERS_JSON}")
    print("\n".join(errors))
    sys.exit(1)

try:
    data = json.loads(SPEAKERS_JSON.read_text(encoding="utf-8"))
except json.JSONDecodeError as e:
    fail(f"speakers.json is not valid JSON: {e}")
    print("\n".join(errors))
    sys.exit(1)

speakers = data.get("speakers")
if not isinstance(speakers, list) or not speakers:
    fail("speakers.json: 'speakers' must be a non-empty array")
    print("\n".join(errors))
    sys.exit(1)

required = ["id", "name", "role", "photo", "bio"]
for i, sp in enumerate(speakers):
    for field in required:
        if not sp.get(field):
            fail(f"speaker[{i}] missing required field: {field}")
    photo = sp.get("photo")
    if photo:
        photo_path = ROOT / photo
        if not photo_path.exists():
            fail(f"speaker[{sp.get('id', i)}]: photo not found: {photo}")
        webp = photo_path.with_suffix(".webp")
        if not webp.exists():
            fail(f"speaker[{sp.get('id', i)}]: webp version not found: {webp.relative_to(ROOT)}")

if not INDEX_HTML.exists():
    fail(f"missing file: {INDEX_HTML}")
    print("\n".join(errors))
    sys.exit(1)

html = INDEX_HTML.read_text(encoding="utf-8")

if 'id="experts"' not in html:
    fail('index.html: id="experts" not found')

card_count = html.count('class="expert-card')
if card_count != len(speakers):
    fail(f"expert-card count ({card_count}) != speakers count ({len(speakers)})")

for sp in speakers:
    name = sp.get("name", "")
    if name and name not in html:
        fail(f"speaker name not present in index.html: {name}")

if errors:
    print("FAIL")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)

print(f"PASS: {len(speakers)} speakers validated, photos+webp present, names found in index.html")
if warnings:
    for w in warnings:
        print(f"  warn: {w}")
sys.exit(0)
