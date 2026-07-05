/**
 * db.js
 * Подключение к PostgreSQL через пул соединений
 */

const { Pool } = require('pg');
require('dotenv').config();

// Настройки подключения
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'chat_user',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE || 'chat_app',
    max: 20, // Максимальное количество соединений в пуле
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Логирование событий
pool.on('connect', () => {
    console.log('✅ PostgreSQL подключен');
});

pool.on('error', (err) => {
    console.error('❌ Ошибка PostgreSQL:', err.message);
});

// Тестовый запрос при первом подключении
pool.query('SELECT NOW()')
    .then(() => console.log('✅ PostgreSQL готов к работе'))
    .catch(err => console.error('❌ Ошибка подключения к PostgreSQL:', err.message));

module.exports = pool;