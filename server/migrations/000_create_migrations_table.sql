-- ============================================
-- Миграция 000: Таблица для отслеживания миграций
-- ============================================

CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE migrations IS 'Список выполненных миграций';

-- Проверяем, была ли уже выполнена эта миграция
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM migrations WHERE name = '000_create_migrations_table') THEN
        INSERT INTO migrations (name) VALUES ('000_create_migrations_table');
        RAISE NOTICE '✅ Таблица migrations создана';
    ELSE
        RAISE NOTICE 'ℹ️ Таблица migrations уже существует';
    END IF;
END;
$$;