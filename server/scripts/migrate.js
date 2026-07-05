/**
 * scripts/migrate.js
 * Скрипт для выполнения миграций базы данных
 * 
 * Использование:
 *   node scripts/migrate.js          # Выполнить все миграции
 *   node scripts/migrate.js up       # Выполнить все миграции
 *   node scripts/migrate.js down     # Откатить последнюю миграцию
 *   node scripts/migrate.js status   # Показать статус миграций
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Настройки подключения к PostgreSQL
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'chat_user',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE || 'chat_app',
});

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

/**
 * Получить список всех миграций (SQL файлы)
 */
function getMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.error(`❌ Папка с миграциями не найдена: ${MIGRATIONS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(file => file.endsWith('.sql'))
        .sort(); // Сортировка по имени (001, 002, ...)

    return files;
}

/**
 * Получить список выполненных миграций из БД
 */
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

/**
 * Выполнить одну миграцию
 */
async function executeMigration(fileName, sql) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log(`  🔄 Выполняется: ${fileName}`);

        // Разбиваем SQL на отдельные statements
        const statements = sql
            .split(';')
            .filter(stmt => stmt.trim().length > 0);

        for (const stmt of statements) {
            await client.query(stmt);
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

/**
 * Выполнить все миграции
 */
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
            break; // Останавливаемся при ошибке
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

/**
 * Откатить последнюю миграцию
 */
async function migrateDown() {
    console.log('🔙 Откат последней миграции...\n');

    const executed = await getExecutedMigrations();
    if (executed.length === 0) {
        console.log('ℹ️ Нет выполненных миграций для отката');
        process.exit(0);
    }

    const lastMigration = executed[executed.length - 1];
    console.log(`📄 Откатываем: ${lastMigration}`);

    // TODO: Реализовать откат (для этого нужны down-скрипты)
    console.log('⚠️  Откат миграций пока не реализован');
    console.log('   Для отката удалите запись из таблицы migrations и выполните обратные SQL');

    process.exit(0);
}

/**
 * Показать статус миграций
 */
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

/**
 * Главная функция
 */
async function main() {
    const command = process.argv[2] || 'up';

    try {
        await pool.connect();
        console.log('✅ Подключено к PostgreSQL\n');
    } catch (error) {
        console.error('❌ Не удалось подключиться к PostgreSQL:', error.message);
        console.error('   Проверьте переменные окружения в .env');
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