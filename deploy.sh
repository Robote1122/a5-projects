#!/bin/bash
# ═══════════════════════════════════════════════════════════
# deploy.sh — полный деплой Vzmakh Chat на сервер
# Запускать из корня проекта: bash deploy.sh
# ═══════════════════════════════════════════════════════════

set -e

echo "📦 [1/5] Установка зависимостей бэкенда..."
cd server && npm install --production && cd ..

echo "📦 [2/5] Установка зависимостей фронтенда..."
cd client && npm install && npm run build && cd ..

echo "🗂️  [3/5] Создание папки логов..."
mkdir -p logs

echo "🚀 [4/5] Запуск/рестарт через PM2..."
if pm2 list | grep -q "vzmakh-chat"; then
  pm2 reload vzmakh-chat --update-env
else
  pm2 start ecosystem.config.js
  pm2 save
fi

echo "🌐 [5/5] Проверка nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "✅ Деплой завершён!"
echo "   Сервер: http://localhost:8001"
echo "   Сайт:   https://vzmakh.su"
