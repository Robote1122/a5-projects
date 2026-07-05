/**
 * routes/auth.js
 * Эндпоинты для аутентификации и управления пользователями
 */

const router = require('express').Router();
const { generateToken } = require('@latanda/auth-middleware');
const pool = require('../db');
const bcrypt = require('bcryptjs');
const { authenticate, requireRole } = require('../middleware/auth');

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
 * Проверка пароля
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

/* ─── POST /api/auth/register ──────────────────────────── */
// Только для администраторов
router.post('/register', authenticate, requireRole('ADMIN'), async (req, res) => {
    try {
        const { email, password, full_name, role = 'USER' } = req.body;
        
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
        const existing = await findUserByEmail(email);
        if (existing) {
            return res.status(400).json({
                success: false,
                error: 'Пользователь с таким email уже существует'
            });
        }
        
        // Создаём пользователя
        const user = await createUser(email, password, full_name, role);
        
        res.status(201).json({
            success: true,
            data: user
        });
        
    } catch (err) {
        console.error('[POST /auth/register] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── POST /api/auth/login ────────────────────────────── */
router.post('/login', async (req, res) => {
    console.log('\n🔐 ====== LOGIN REQUEST ======');
    console.log('📧 Email:', req.body.email);
    console.log('📝 Password length:', req.body.password?.length || 0);
    
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            console.log('❌ Email или пароль отсутствуют');
            return res.status(400).json({
                success: false,
                error: 'Email и пароль обязательны'
            });
        }
        
        // Ищем пользователя
        console.log('🔍 Ищем пользователя:', email);
        const user = await findUserByEmail(email);
        
        if (!user) {
            console.log('❌ Пользователь не найден:', email);
            return res.status(401).json({
                success: false,
                error: 'Неверный email или пароль'
            });
        }
        
        console.log('✅ Пользователь найден:', {
            id: user.id,
            email: user.email,
            role: user.role,
            is_active: user.is_active
        });
        
        // Проверяем, активен ли пользователь
        if (!user.is_active) {
            console.log('❌ Аккаунт заблокирован');
            return res.status(403).json({
                success: false,
                error: 'Аккаунт заблокирован. Обратитесь к администратору.'
            });
        }
        
        // Проверяем пароль
        console.log('🔍 Проверяем пароль...');
        const isValid = await verifyPassword(user, password);
        console.log('✅ Пароль валидный:', isValid);
        
        if (!isValid) {
            console.log('❌ Неверный пароль');
            return res.status(401).json({
                success: false,
                error: 'Неверный email или пароль'
            });
        }
        
        // Обновляем last_login
        console.log('🔄 Обновляем last_login...');
        await updateLastLogin(user.id);
        
        // Генерируем JWT
        console.log('🔑 Генерируем JWT...');
        const token = generateToken({
            id: user.id,
            email: user.email,
            role: user.role,
        }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        
        console.log('✅ JWT сгенерирован:', token.substring(0, 20) + '...');
        
        // Устанавливаем httpOnly cookie
        console.log('🍪 Устанавливаем cookie...');
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });
        console.log('✅ Cookie установлен');
        
        // Возвращаем данные пользователя
        const { password_hash, ...userData } = user;
        console.log('📤 Отправляем ответ:', {
            success: true,
            user: {
                id: userData.id,
                email: userData.email,
                role: userData.role
            }
        });
        
        res.json({
            success: true,
            data: {
                user: userData,
                token: token
            }
        });
        
        console.log('🔐 ====== LOGIN COMPLETE ======\n');
        
    } catch (err) {
        console.error('❌ Ошибка логина:', err);
        console.error('❌ Stack:', err.stack);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── POST /api/auth/logout ───────────────────────────── */
router.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    });
    res.json({ success: true, message: 'Выход выполнен' });
});

/* ─── GET /api/auth/me ────────────────────────────────── */
router.get('/me', authenticate, (req, res) => {
    console.log('\n👤 ====== ME REQUEST ======');
    console.log('📋 Headers:', {
        cookie: req.headers.cookie || 'Нет cookie',
        authorization: req.headers.authorization || 'Нет'
    });
    console.log('👤 User from middleware:', req.user);
    
    if (!req.user) {
        console.log('❌ User не найден в req');
        return res.status(401).json({
            success: false,
            error: 'Неавторизован'
        });
    }
    
    const { password_hash, ...userData } = req.user;
    console.log('✅ Возвращаем пользователя:', {
        id: userData.id,
        email: userData.email,
        role: userData.role
    });
    console.log('👤 ====== ME COMPLETE ======\n');
    
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