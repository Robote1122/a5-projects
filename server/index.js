/**
 * index.js
 * Точка входа Express-сервера
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fileUpload = require('express-fileupload');

// Импортируем из @latanda/auth-middleware
const { createAuthMiddleware, requireRole } = require('@latanda/auth-middleware');

const { findUserById } = require('./services/userService');
const chatsRouter = require('./routes/chats');
const authRouter = require('./routes/auth');
const promptsRouter = require('./routes/prompts');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 8001;

/* ─── Middleware ─────────────────────────────────────── */
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    safeFileNames: true,
}));

/* ─── Настройка auth middleware ──────────────────────── */
const authMiddleware = createAuthMiddleware({
    secret: process.env.JWT_SECRET,
    getUserById: findUserById,
    cookieName: 'token', // Имя cookie с токеном
});

/* ─── Логирование запросов ───────────────────────────── */
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

/* ─── API маршруты ───────────────────────────────────── */
// Используем authMiddleware для всех защищённых роутов
app.use('/api/chats', authMiddleware, chatsRouter);
app.use('/api/prompts', authMiddleware, promptsRouter);

// Auth роуты (логин, регистрация) - без middleware
app.use('/api/auth', authRouter);

// Пример админского роута с проверкой роли
app.get('/api/admin/health', authMiddleware, requireRole('ADMIN'), (req, res) => {
    res.json({ 
        success: true, 
        message: 'Admin area',
        user: req.user 
    });
});

/* ─── Health check ───────────────────────────────────── */
app.get('/api/health', async (_req, res) => {
    const pool = require('./db');
    try {
        await pool.query('SELECT 1');
        res.json({ 
            success: true, 
            status: 'ok', 
            uptime: process.uptime(),
            database: 'connected'
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            status: 'degraded',
            database: 'disconnected',
            error: error.message
        });
    }
});

/* ─── Статика фронтенда ──────────────────────────────── */
const clientBuild = path.join(__dirname, '../client/dist');
if (require('fs').existsSync(clientBuild)) {
    app.use(express.static(clientBuild));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(clientBuild, 'index.html'));
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