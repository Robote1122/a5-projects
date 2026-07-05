/**
 * routes/auth.js
 * Эндпоинты для аутентификации и управления пользователями
 */

const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const { generateToken } = require('../services/jwtService');
const { authenticate, requireRole } = require('../middleware/auth');

/* ─── POST /api/auth/register ──────────────────────────── */
// Только для администраторов
router.post('/register', authenticate, requireRole('ADMIN'), async (req, res) => {
    try {
        const { email, password, full_name, role = 'USER' } = req.body;
        
        // Валидация
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email и пароль обязательны'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Пароль должен быть не менее 6 символов'
            });
        }
        
        // Проверяем, существует ли пользователь
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Пользователь с таким email уже существует'
            });
        }
        
        // Хешируем пароль
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(password, saltRounds);
        
        // Создаём пользователя
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, role) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, email, full_name, role, created_at`,
            [email.toLowerCase(), password_hash, full_name || null, role]
        );
        
        res.status(201).json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (err) {
        console.error('[POST /auth/register] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── POST /api/auth/login ────────────────────────────── */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email и пароль обязательны'
            });
        }
        
        // Ищем пользователя
        const result = await pool.query(
            `SELECT id, email, password_hash, full_name, role, is_active 
             FROM users WHERE email = $1`,
            [email.toLowerCase()]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Неверный email или пароль'
            });
        }
        
        const user = result.rows[0];
        
        // Проверяем, активен ли пользователь
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                error: 'Аккаунт заблокирован. Обратитесь к администратору.'
            });
        }
        
        // Проверяем пароль
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Неверный email или пароль'
            });
        }
        
        // Обновляем last_login
        await pool.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );
        
        // Генерируем JWT
        const token = generateToken(user);
        
        // Устанавливаем httpOnly cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
        });
        
        // Возвращаем данные пользователя (без пароля)
        const { password_hash, ...userData } = user;
        res.json({
            success: true,
            data: {
                user: userData,
                token: token // для клиентов, которые не используют cookies
            }
        });
        
    } catch (err) {
        console.error('[POST /auth/login] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── POST /api/auth/logout ───────────────────────────── */
router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    });
    res.json({ success: true, message: 'Выход выполнен' });
});

/* ─── GET /api/auth/me ────────────────────────────────── */
router.get('/me', authenticate, (req, res) => {
    const { password_hash, ...userData } = req.user;
    res.json({ success: true, data: userData });
});

/* ─── GET /api/auth/users ─────────────────────────────── */
// Только для администраторов
router.get('/users', authenticate, requireRole('ADMIN'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, full_name, role, created_at, last_login, is_active 
             FROM users 
             ORDER BY created_at DESC`
        );
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[GET /auth/users] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── PATCH /api/auth/users/:id/role ─────────────────── */
// Только для администраторов
router.patch('/users/:id/role', authenticate, requireRole('ADMIN'), async (req, res) => {
    try {
        const { role } = req.body;
        const userId = parseInt(req.params.id);
        
        if (!role || !['ADMIN', 'MIT', 'IT', 'USER'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Неверная роль. Допустимые: ADMIN, MIT, IT, USER'
            });
        }
        
        // Не даём изменить свою роль
        if (userId === req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Нельзя изменить свою роль'
            });
        }
        
        const result = await pool.query(
            `UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING id, email, full_name, role`,
            [role, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Пользователь не найден'
            });
        }
        
        res.json({ success: true, data: result.rows[0] });
        
    } catch (err) {
        console.error('[PATCH /auth/users/:id/role] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;