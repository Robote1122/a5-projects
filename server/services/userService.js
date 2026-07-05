/**
 * services/userService.js
 * Адаптер для работы с пользователями через @latanda/auth-middleware
 */

const pool = require('../db');
const bcrypt = require('bcrypt');

/**
 * Поиск пользователя по ID
 */
async function findUserById(id) {
    const result = await pool.query(
        'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Поиск пользователя по email
 */
async function findUserByEmail(email) {
    const result = await pool.query(
        'SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = $1',
        [email.toLowerCase()]
    );
    return result.rows[0] || null;
}

/**
 * Создание пользователя
 */
async function createUser(email, password, fullName, role = 'USER') {
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    const result = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, email, full_name, role, created_at`,
        [email.toLowerCase(), passwordHash, fullName, role]
    );
    
    return result.rows[0];
}

/**
 * Проверка пароля пользователя
 */
async function verifyPassword(user, password) {
    return await bcrypt.compare(password, user.password_hash);
}

/**
 * Обновление last_login
 */
async function updateLastLogin(userId) {
    await pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [userId]
    );
}

module.exports = {
    findUserById,
    findUserByEmail,
    createUser,
    verifyPassword,
    updateLastLogin,
};