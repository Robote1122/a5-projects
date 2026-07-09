-- ============================================
-- Миграция 001: Начальная схема базы данных
-- ============================================

-- Включаем расширение для генерации UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ТАБЛИЦА: users (пользователи)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'USER',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    CONSTRAINT valid_role CHECK (role IN ('ADMIN', 'MIT', 'IT', 'USER'))
);

COMMENT ON TABLE users IS 'Пользователи системы';
COMMENT ON COLUMN users.email IS 'Email пользователя (уникальный)';
COMMENT ON COLUMN users.role IS 'Роль пользователя: ADMIN, MIT, IT, USER';

-- ============================================
-- ТАБЛИЦА: sessions (сессии JWT)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sessions IS 'Активные сессии пользователей для инвалидации токенов';

-- ============================================
-- ТАБЛИЦА: permissions (права доступа)
-- ============================================
CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

COMMENT ON TABLE permissions IS 'Список доступных прав доступа';

-- ============================================
-- ТАБЛИЦА: user_permissions (связь пользователей с правами)
-- ============================================
CREATE TABLE IF NOT EXISTS user_permissions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, permission_id)
);

COMMENT ON TABLE user_permissions IS 'Какие права у каких пользователей';

-- ============================================
-- ТАБЛИЦА: chats (чаты)
-- ============================================
CREATE TABLE IF NOT EXISTS chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Новый чат',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE chats IS 'Чаты пользователей';
COMMENT ON COLUMN chats.user_id IS 'Владелец чата (пользователь)';

-- ============================================
-- ТАБЛИЦА: messages (сообщения)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_role CHECK (role IN ('user', 'assistant', 'system'))
);

COMMENT ON TABLE messages IS 'Сообщения в чатах';
COMMENT ON COLUMN messages.role IS 'Роль отправителя: user, assistant, system';

-- ============================================
-- ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
-- ============================================

-- Индексы для chats
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at);
CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_id, updated_at DESC);

-- Индексы для messages
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at ASC);

-- Индексы для users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Индексы для sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- ТРИГГЕРЫ
-- ============================================

-- Функция для автоматического обновления updated_at в users
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at_trigger ON users;
CREATE TRIGGER users_updated_at_trigger
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Функция для автоматического обновления updated_at в chats
CREATE OR REPLACE FUNCTION update_chats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chats_updated_at_trigger ON chats;
CREATE TRIGGER chats_updated_at_trigger
    BEFORE UPDATE ON chats
    FOR EACH ROW
    EXECUTE FUNCTION update_chats_updated_at();

-- ============================================
-- НАЧАЛЬНЫЕ ДАННЫЕ
-- ============================================

-- Создаём администратора с временным хешем пароля
-- Реальный пароль будет установлен позже через скрипт set-admin-password.js
INSERT INTO users (email, password_hash, full_name, role, is_active, email_verified)
VALUES (
    'admin@example.com', 
    '$2b$12$dummy_hash_that_will_be_replaced_later',  -- Временный хеш
    'System Administrator', 
    'ADMIN', 
    TRUE, 
    TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Базовые права доступа
INSERT INTO permissions (name, description) VALUES
    ('manage_users', 'Управление пользователями'),
    ('manage_chats', 'Управление чатами'),
    ('manage_prompts', 'Управление промптами'),
    ('view_analytics', 'Просмотр аналитики'),
    ('manage_roles', 'Управление ролями')
ON CONFLICT (name) DO NOTHING;

-- Назначаем права администратору
INSERT INTO user_permissions (user_id, permission_id)
SELECT 
    u.id,
    p.id
FROM users u, permissions p
WHERE u.email = 'admin@example.com'
ON CONFLICT (user_id, permission_id) DO NOTHING;

-- ============================================
-- ВЫВОД ИНФОРМАЦИИ
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Миграция 001 успешно выполнена';
    RAISE NOTICE '📊 Созданы таблицы: users, sessions, permissions, user_permissions, chats, messages';
    RAISE NOTICE '🔑 Создан администратор: admin@example.com';
    RAISE NOTICE '⚠️  Не забудьте установить пароль для администратора!';
END;
$$;