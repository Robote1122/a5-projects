/**
 * index.js
 * Точка входа Express-сервера для Vzmakh Chat.
 * Порт: 8001 (конфигурируется через .env → PORT)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fileUpload = require('express-fileupload'); // Добавить

const chatsRouter = require('./routes/chats');
const promptsRouter = require('./routes/prompts'); // Добавить
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 8001;

/* ─── Middleware ─────────────────────────────────────── */
app.use(cors({
  origin: '*', // Настрой конкретный домен в проде при необходимости
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Добавляем поддержку файлов
app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    abortOnLimit: true,
    safeFileNames: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/* ─── Логирование запросов ───────────────────────────── */
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/* ─── API маршруты ───────────────────────────────────── */
app.use('/api/chats', chatsRouter);
app.use('/api/prompts', promptsRouter);

/* ─── Health check ───────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime() });
});

/* ─── Статика фронтенда (после сборки) ──────────────── */
const clientBuild = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuild));

// SPA fallback — все неизвестные GET → index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

/* ─── Глобальный обработчик ошибок ──────────────────── */
app.use(errorHandler);

/* ─── Запуск ─────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀 Vzmakh Chat сервер запущен на http://localhost:${PORT}`);
  console.log(`📝 Прокси промптов: http://localhost:${PORT}/api/prompts`);
});

module.exports = app;
