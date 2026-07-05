# Dockerfile для бэкенда (Node.js)
FROM node:22-alpine

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY server/package*.json ./
RUN npm ci --only=production

# Копируем исходный код
COPY server/ ./

# Копируем собранный фронтенд (если есть)
COPY client/dist ./public

# Создаём папки для данных
RUN mkdir -p /app/data /app/logs

# Переменные окружения
ENV NODE_ENV=production
ENV PORT=8001

# Открываем порт
EXPOSE 8001

# Запускаем сервер
CMD ["node", "index.js"]