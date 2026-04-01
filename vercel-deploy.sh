#!/bin/bash

# 🚀 VERCEL AUTOMATIC DEPLOYMENT SCRIPT
# Автоматическое развертывание на Vercel

set -e

echo "=================================="
echo "🚀 VERCEL DEPLOYMENT WIZARD"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "vercel.json" ]; then
    echo -e "${RED}❌ Error: vercel.json not found!${NC}"
    echo "Please run this script from the project root directory."
    exit 1
fi

echo -e "${BLUE}📋 Проверяю файлы...${NC}"
echo ""

# Check required files
files_to_check=(
    "api/ai-interpretation.js"
    "api/utils/openai-client.js"
    "api/utils/prompts.js"
    "api/utils/cache.js"
    "vercel.json"
    ".env.example"
)

for file in "${files_to_check[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅${NC} $file"
    else
        echo -e "${RED}❌${NC} $file - NOT FOUND"
        exit 1
    fi
done

echo ""
echo -e "${GREEN}✓ Все файлы на месте!${NC}"
echo ""

# Now get the credentials
echo "=================================="
echo "📝 ВВЕДИТЕ ДАННЫЕ"
echo "=================================="
echo ""

echo -e "${YELLOW}1️⃣  VERCEL AUTH TOKEN${NC}"
echo "Получить: https://vercel.com/account/tokens"
echo "Нажмите 'Create Token' и скопируйте"
read -s -p "Введите Vercel Auth Token: " VERCEL_TOKEN
echo ""

if [ -z "$VERCEL_TOKEN" ]; then
    echo -e "${RED}❌ Vercel token не может быть пустым!${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}2️⃣  OPENAI API KEY${NC}"
echo "Ваш ключ из ChatGPT (sk-proj-...)"
read -s -p "Введите OpenAI API Key: " OPENAI_KEY
echo ""

if [ -z "$OPENAI_KEY" ]; then
    echo -e "${RED}❌ OpenAI key не может быть пустым!${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}3️⃣  VERCEL PROJECT NAME${NC}"
read -p "Введите имя проекта на Vercel [numerology-forum-landing]: " PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-numerology-forum-landing}

echo ""
echo "=================================="
echo "🔍 ДАННЫЕ ДЛЯ ПОДТВЕРЖДЕНИЯ"
echo "=================================="
echo ""
echo -e "Project Name: ${BLUE}$PROJECT_NAME${NC}"
echo -e "Vercel Token: ${BLUE}${VERCEL_TOKEN:0:10}...${NC}"
echo -e "OpenAI Key: ${BLUE}${OPENAI_KEY:0:10}...${NC}"
echo ""

read -p "Всё правильно? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Отмена${NC}"
    exit 1
fi

echo ""
echo "=================================="
echo "⚙️  УСТАНОВКА VERCEL CLI"
echo "=================================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📥 Установка Vercel CLI..."
    npm install -g vercel
    echo -e "${GREEN}✓ Vercel CLI установлен${NC}"
else
    echo -e "${GREEN}✓ Vercel CLI уже установлен${NC}"
fi

echo ""
echo "=================================="
echo "🚀 НАЧИНАЕМ РАЗВЕРТЫВАНИЕ"
echo "=================================="
echo ""

# Set environment variable for non-interactive mode
export VERCEL_TOKEN="$VERCEL_TOKEN"

echo "📤 Развертываю проект на Vercel..."
echo ""

# Deploy using Vercel CLI
if vercel deploy \
    --prod \
    --name "$PROJECT_NAME" \
    --build-env OPENAI_API_KEY="$OPENAI_KEY" \
    --env OPENAI_API_KEY="$OPENAI_KEY" \
    --no-wait 2>/dev/null; then

    DEPLOYMENT_URL=$(vercel list --token="$VERCEL_TOKEN" | grep "$PROJECT_NAME" | head -1 | awk '{print $NF}')

    echo -e "${GREEN}✓ Deploy успешно запущен!${NC}"
    echo ""
    echo "=================================="
    echo "✅ ГОТОВО!"
    echo "=================================="
    echo ""
    echo -e "${GREEN}🌐 Ваш сайт:${NC}"
    echo "   https://${DEPLOYMENT_URL}"
    echo ""
    echo "⏳ Deployment займет 1-3 минуты"
    echo "Проверьте статус на: https://vercel.com/dashboard"
    echo ""
    echo "Когда deployment завершится:"
    echo "1. Откройте сайт"
    echo "2. Введите дату рождения"
    echo "3. Нажмите 'Рассчитать'"
    echo "4. Нажмите '✨ Получить AI анализ'"
    echo "5. Подождите 5-10 секунд"
    echo "6. Должен появиться анализ от ChatGPT! 🤖"
    echo ""

else
    echo ""
    echo -e "${BLUE}ℹ️  Если вы видите ошибку с аутентификацией:${NC}"
    echo ""
    echo "Нужно авторизовать Vercel CLI вручную:"
    echo ""
    echo "1. Запустите:"
    echo "   ${YELLOW}vercel login${NC}"
    echo ""
    echo "2. Откройте ссылку в браузере"
    echo "3. Авторизуйтесь"
    echo "4. Вернитесь сюда и запустите скрипт снова"
    echo ""

    # Try manual login
    read -p "Попробовать авторизацию? (y/n): " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        vercel login
        echo ""
        echo "Теперь запустите скрипт еще раз:"
        echo "   ${YELLOW}bash vercel-deploy.sh${NC}"
    fi
fi

echo ""
echo -e "${BLUE}💡 Нужна помощь? Смотрите VERCEL_SETUP.md${NC}"
echo ""
