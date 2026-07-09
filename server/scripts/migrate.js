/**
 * scripts/migrate.js
 * Скрипт для выполнения миграций базы данных
 */

const path = require('path');
const fs = require('fs');

// Загружаем .env из папки server
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Если не загрузился - пробуем из корня
if (!process.env.POSTGRES_HOST) {
    require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const { Pool } = require('pg');

console.log('🔍 Проверка переменных окружения:');
console.log(`   POSTGRES_HOST: ${process.env.POSTGRES_HOST || '❌ НЕ УСТАНОВЛЕН'}`);
console.log(`   POSTGRES_USER: ${process.env.POSTGRES_USER || '❌ НЕ УСТАНОВЛЕН'}`);
console.log(`   POSTGRES_DB: ${process.env.POSTGRES_DB || '❌ НЕ УСТАНОВЛЕН'}`);
console.log('');

// Настройки подключения к PostgreSQL
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'chat_user',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE || 'chat_app',
    connectionTimeoutMillis: 5000,
});

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

// Получить список всех миграций (SQL файлы)
function getMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.error(`❌ Папка с миграциями не найдена: ${MIGRATIONS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(file => file.endsWith('.sql'))
        .sort();

    return files;
}

// Получить список выполненных миграций из БД
async function getExecutedMigrations() {
    try {
        // Создаём таблицу migrations, если её нет
        await pool.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const result = await pool.query(
            'SELECT name FROM migrations ORDER BY id'
        );
        return result.rows.map(row => row.name);
    } catch (error) {
        console.error('❌ Ошибка получения списка миграций:', error.message);
        return [];
    }
}

// Разбиваем SQL на отдельные выражения с учётом $$ блоков
function splitSqlStatements(sql) {
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    let dollarQuoteTag = '';
    let i = 0;
    
    while (i < sql.length) {
        // Проверяем начало долларовой кавычки
        if (!inDollarQuote && sql[i] === '$' && i + 1 < sql.length && sql[i + 1] === '$') {
            inDollarQuote = true;
            // Находим тег долларовой кавычки
            let tagStart = i;
            let j = i + 2;
            while (j < sql.length && sql[j] !== '$') j++;
            if (j < sql.length && sql[j] === '$') {
                dollarQuoteTag = sql.substring(i, j + 1);
                current += dollarQuoteTag;
                i = j + 1;
                continue;
            }
        }
        
        // Проверяем конец долларовой кавычки
        if (inDollarQuote && sql.substring(i, i + dollarQuoteTag.length) === dollarQuoteTag) {
            inDollarQuote = false;
            current += dollarQuoteTag;
            i += dollarQuoteTag.length;
            continue;
        }
        
        // Если не в долларовой кавычке и встречаем точку с запятой
        if (!inDollarQuote && sql[i] === ';') {
            const trimmed = current.trim();
            if (trimmed) {
                statements.push(trimmed);
            }
            current = '';
            i++;
            continue;
        }
        
        current += sql[i];
        i++;
    }
    
    // Добавляем последний кусок
    const trimmed = current.trim();
    if (trimmed) {
        statements.push(trimmed);
    }
    
    return statements;
}

// Выполнить одну миграцию
async function executeMigration(fileName, sql) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log(`  🔄 Выполняется: ${fileName}`);

        // Разбиваем SQL на отдельные statements с учётом $$ блоков
        const statements = splitSqlStatements(sql);

        for (const stmt of statements) {
            if (stmt.trim()) {
                await client.query(stmt);
            }
        }

        // Записываем в таблицу migrations
        await client.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [fileName]
        );

        await client.query('COMMIT');
        console.log(`  ✅ Выполнено: ${fileName}`);
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Ошибка в ${fileName}:`, error.message);
        return false;
    } finally {
        client.release();
    }
}

// Выполнить все миграции
async function migrateUp() {
    console.log('🚀 Начинаем миграцию базы данных...\n');

    const files = getMigrationFiles();
    const executed = await getExecutedMigrations();

    console.log(`📁 Найдено миграций: ${files.length}`);
    console.log(`✅ Выполнено: ${executed.length}`);
    console.log(`⏳ Осталось: ${files.length - executed.length}\n`);

    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
        if (executed.includes(file)) {
            console.log(`⏭️  Пропускаем (уже выполнена): ${file}`);
            continue;
        }

        const sql = fs.readFileSync(
            path.join(MIGRATIONS_DIR, file),
            'utf-8'
        );

        const success = await executeMigration(file, sql);
        if (success) {
            successCount++;
        } else {
            failCount++;
            // Показываем детали ошибки для отладки
            console.log(`   💡 Проверьте синтаксис в файле: ${file}`);
            break;
        }
    }

    console.log('\n📊 Результат:');
    console.log(`   ✅ Успешно: ${successCount}`);
    console.log(`   ❌ Ошибок: ${failCount}`);

    if (failCount === 0) {
        console.log('✅ Все миграции выполнены успешно!');
        process.exit(0);
    } else {
        console.error('❌ Миграция завершена с ошибками');
        process.exit(1);
    }
}

// Откатить последнюю миграцию
async function migrateDown() {
    console.log('🔙 Откат последней миграции...\n');

    const executed = await getExecutedMigrations();
    if (executed.length === 0) {
        console.log('ℹ️ Нет выполненных миграций для отката');
        process.exit(0);
    }

    const lastMigration = executed[executed.length - 1];
    console.log(`📄 Откатываем: ${lastMigration}`);
    console.log('⚠️  Откат миграций пока не реализован');
    console.log('   Для отката удалите запись из таблицы migrations и выполните обратные SQL');

    process.exit(0);
}

// Показать статус миграций
async function showStatus() {
    console.log('📊 Статус миграций:\n');

    const files = getMigrationFiles();
    const executed = await getExecutedMigrations();

    console.log(`📁 Всего миграций: ${files.length}`);
    console.log(`✅ Выполнено: ${executed.length}`);
    console.log(`⏳ Ожидают: ${files.length - executed.length}\n`);

    console.log('📋 Детали:');
    for (const file of files) {
        const status = executed.includes(file) ? '✅' : '⏳';
        console.log(`   ${status} ${file}`);
    }

    process.exit(0);
}

// Главная функция
async function main() {
    const command = process.argv[2] || 'up';

    try {
        await pool.connect();
        console.log('✅ Подключено к PostgreSQL\n');
    } catch (error) {
        console.error('❌ Не удалось подключиться к PostgreSQL:');
        console.error(`   ${error.message}`);
        console.error('\n   Проверьте:');
        console.error('   1. Запущен ли PostgreSQL: sudo systemctl status postgresql');
        console.error('   2. Правильные ли переменные в .env');
        console.error('   3. Существует ли БД: psql -U chat_user -d chat_app');
        process.exit(1);
    }

    switch (command.toLowerCase()) {
        case 'up':
        case 'migrate':
            await migrateUp();
            break;
        case 'down':
        case 'rollback':
            await migrateDown();
            break;
        case 'status':
        case 'list':
            await showStatus();
            break;
        default:
            console.error(`❌ Неизвестная команда: ${command}`);
            console.log('Использование:');
            console.log('  node scripts/migrate.js           # Выполнить все миграции');
            console.log('  node scripts/migrate.js up        # Выполнить все миграции');
            console.log('  node scripts/migrate.js down      # Откатить последнюю миграцию');
            console.log('  node scripts/migrate.js status    # Показать статус');
            process.exit(1);
    }

    await pool.end();
}

// Запускаем
main().catch(error => {
    console.error('❌ Необработанная ошибка:', error);
    process.exit(1);
});