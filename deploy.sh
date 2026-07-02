#!/bin/bash
# deploy.sh — Docker деплой

set -e

echo "🐳 [1/5] Остановка старых контейнеров..."
docker-compose down

echo "📦 [2/5] Сборка Docker образов..."
docker-compose build --no-cache

echo "🗄️  [3/5] Подготовка данных..."
mkdir -p server/data
mkdir -p ai-service/data

# Копируем ChromaDB если существует
if [ -d "ai-service/safety_checklist_db" ]; then
  cp -r ai-service/safety_checklist_db/* ai-service/data/
fi

echo "🚀 [4/5] Запуск контейнеров..."
docker-compose up -d

echo "🔍 [5/5] Проверка статуса..."
sleep 5
docker-compose ps

echo ""
echo "✅ Деплой завершён!"
echo "   Backend: http://localhost:8001"
echo "   AI Service: http://localhost:8002"
echo "   Nginx: http://localhost (если включен)"
echo ""
echo "📊 Логи: docker-compose logs -f"