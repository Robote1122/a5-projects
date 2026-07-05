-- Дополнительная инициализация БД
-- Создаём расширение для UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Устанавливаем кодировку
SET client_encoding = 'UTF8';

-- Проверяем, что всё создалось
SELECT version();