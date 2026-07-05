#!/bin/bash
# deploy.sh — Docker деплой

set -e

echo "🐳 [1/6] Остановка старых контейнеров..."
docker-compose down

echo "📦 [2/6] Сборка фронтенда..."
cd client
npm install
npm run build
cd ..

echo "📦 [3/6] Сборка Docker образов..."
docker-compose build --no-cache

echo "🗄️  [4/6] Подготовка данных..."
mkdir -p server/data
mkdir -p ai-service/data
mkdir -p ai-service/prompts
mkdir -p logs

# Копируем существующие данные если есть
if [ -d "ai-service/safety_checklist_db" ]; then
  cp -r ai-service/safety_checklist_db/* ai-service/data/ 2>/dev/null || true
fi

# Копируем промпты если есть
if [ -f "ai-service/prompt_start.txt" ]; then
  cp ai-service/prompt_start.txt ai-service/prompts/
fi
if [ -f "ai-service/prompt_continue.txt" ]; then
  cp ai-service/prompt_continue.txt ai-service/prompts/
fi

echo "🚀 [5/6] Запуск контейнеров..."
docker-compose up -d

echo "🔍 [6/6] Проверка статуса..."
sleep 5
docker-compose ps

echo ""
echo "✅ Деплой завершён!"
echo "   Backend: http://localhost:8001"
echo "   AI Service: http://localhost:8002"
echo "   PostgreSQL: localhost:5432"
echo ""
echo "📊 Логи: docker-compose logs -f"