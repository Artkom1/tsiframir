#!/usr/bin/env bash

set -euo pipefail

if [[ ! -f vercel.json || ! -f .vercel/project.json ]]; then
  echo "Запустите скрипт из корня уже связанного Vercel-проекта." >&2
  exit 1
fi

case "${1:-}" in
  "") exec vercel deploy --yes ;;
  --prod) exec vercel deploy --prod --yes ;;
  *) echo "Использование: ./vercel-deploy.sh [--prod]" >&2; exit 2 ;;
esac
