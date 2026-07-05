/**
 * middleware/auth.js
 * Middleware для проверки JWT токена и авторизации
 */

const { verifyToken } = require('../services/jwtService');
const pool = require('../db');

/**
 * Проверка наличия и валидности JWT токена
 * Токен может быть передан в:
 * - httpOnly cookie (name: 'token')
 * - Authorization header (Bearer <token>)
 */
async function authenticate(req, res, next) {
    let token = null;
    
    // 1. Проверяем cookie
    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    
    // 2. Проверяем Authorization header
    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Неавторизован. Токен не найден.'
        });
    }
    
    // Верифицируем токен
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Неавторизован. Невалидный токен.'
        });
    }
    
    // Проверяем, существует ли пользователь в БД
    try {
        const result = await pool.query(
            'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
            [decoded.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Пользователь не найден.'
            });
        }
        
        const user = result.rows[0];
        
        // Проверяем, активен ли пользователь
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                error: 'Аккаунт заблокирован.'
            });
        }
        
        // Добавляем пользователя в req
        req.user = user;
        next();
    } catch (error) {
        console.error('[Auth Middleware Error]', error);
        return res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера.'
        });
    }
}

/**
 * Проверка роли пользователя
 */
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Неавторизован.'
            });
        }
        
        // Если roles - строка, преобразуем в массив
        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Недостаточно прав. Требуется роль: ' + allowedRoles.join(', ')
            });
        }
        
        next();
    };
}

/**
 * Проверка владения ресурсом (чатом)
 */
async function requireOwnership(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Неавторизован.'
        });
    }
    
    const chatId = req.params.id;
    if (!chatId) {
        return res.status(400).json({
            success: false,
            error: 'ID чата не указан.'
        });
    }
    
    try {
        const result = await pool.query(
            'SELECT user_id FROM chats WHERE id = $1',
            [chatId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Чат не найден.'
            });
        }
        
        if (result.rows[0].user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Доступ запрещён. Вы не владелец чата.'
            });
        }
        
        next();
    } catch (error) {
        console.error('[Ownership Middleware Error]', error);
        return res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера.'
        });
    }
}

/**
 * Опциональная аутентификация (не требует токена)
 */
async function optionalAuth(req, res, next) {
    let token = null;
    
    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }
    
    if (!token && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
        }
    }
    
    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            try {
                const result = await pool.query(
                    'SELECT id, email, full_name, role FROM users WHERE id = $1',
                    [decoded.id]
                );
                if (result.rows.length > 0) {
                    req.user = result.rows[0];
                }
            } catch (error) {
                // Игнорируем ошибки при опциональной аутентификации
            }
        }
    }
    
    next();
}

module.exports = {
    authenticate,
    requireRole,
    requireOwnership,
    optionalAuth,
};