# Stage 1: Build frontend
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build

# Stage 2: Build backend
FROM node:22-alpine
WORKDIR /app

# Копируем зависимости бэкенда
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Копируем built frontend
COPY --from=client-builder /app/client/dist /app/client/dist

# Копируем код бэкенда
COPY server/ ./server/

# Копируем docs (опционально)
COPY docs/ ./docs/

WORKDIR /app/server

# Создаем папку для данных
RUN mkdir -p /app/server/data

EXPOSE 8001

CMD ["node", "index.js"]