/**
 * index.js
 * Точка входа Express-сервера для Vzmakh Chat.
 * Порт: 8001 (конфигурируется через .env → PORT)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const chatsRouter = require('./routes/chats');
const authRouter = require('./routes/auth');
const promptsRouter = require('./routes/prompts');
const errorHandler = require('./middleware/errorHandler');
const documentsRouter = require('./routes/documents');

const app = express();
const PORT = process.env.PORT || 8001;

/* ─── Middleware ─────────────────────────────────────── */
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

/* ─── Логирование запросов ───────────────────────────── */
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('🍪 Cookie:', req.headers.cookie || 'Нет cookie');
  next();
});

/* ─── API маршруты ───────────────────────────────────── */
app.use('/api/chats', chatsRouter);
app.use('/api/auth', authRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/documents', documentsRouter);

/* ─── Health check ───────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime() });
});

/* ─── Статика фронтенда (после сборки) ──────────────── */
// В Docker: /app/public (потому что в Dockerfile копируем в public)
// Локально: ../client/dist
const clientBuild = fs.existsSync('/app/public')
    ? '/app/public'
    : path.join(__dirname, '../client/dist');

console.log(`📁 Client build path: ${clientBuild}`);
console.log(`📁 Exists: ${fs.existsSync(clientBuild)}`);

if (fs.existsSync(clientBuild)) {
    app.use(express.static(clientBuild));
    // SPA fallback — все неизвестные GET → index.html
    app.get('*', (_req, res) => {
        res.sendFile(path.join(clientBuild, 'index.html'));
    });
} else {
    console.log(`⚠️  Client build not found at: ${clientBuild}`);
    app.get('*', (_req, res) => {
        res.status(404).send('Frontend not built. Run: cd client && npm run build');
    });
}

/* ─── Глобальный обработчик ошибок ──────────────────── */
app.use(errorHandler);

/* ─── Запуск ─────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📝 API: http://localhost:${PORT}/api`);
  console.log(`🔐 Auth: http://localhost:${PORT}/api/auth`);
  console.log(`💬 Chats: http://localhost:${PORT}/api/chats`);
});

module.exports = app;