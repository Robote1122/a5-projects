/**
 * scripts/create-user.js
 * Скрипт для создания пользователей через командную строку
 * 
 * Использование:
 *   node scripts/create-user.js --email user@example.com --password 123456 --name "Иван" --role USER
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'chat_user',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE || 'chat_app',
});

function parseArgs() {
    const args = {};
    process.argv.slice(2).forEach((arg) => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            args[key] = value || true;
        }
    });
    return args;
}

async function createUser() {
    const args = parseArgs();
    
    const email = args.email;
    const password = args.password;
    const fullName = args.name || args.full_name || '';
    const role = args.role || 'USER';
    
    if (!email || !password) {
        console.error('❌ Укажите --email и --password');
        console.log('Пример: node scripts/create-user.js --email user@example.com --password 123456 --name "Иван" --role USER');
        process.exit(1);
    }
    
    if (!['USER', 'MIT', 'IT', 'ADMIN'].includes(role)) {
        console.error('❌ Неверная роль. Доступные: USER, MIT, IT, ADMIN');
        process.exit(1);
    }
    
    try {
        // Проверяем существование
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        
        if (existing.rows.length > 0) {
            console.error(`❌ Пользователь ${email} уже существует`);
            process.exit(1);
        }
        
        // Хешируем пароль
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Создаём пользователя
        const result = await pool.query(
            `INSERT INTO users (email, password_hash, full_name, role) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, email, full_name, role, created_at`,
            [email.toLowerCase(), passwordHash, fullName, role]
        );
        
        console.log('✅ Пользователь создан:');
        console.log(`   ID: ${result.rows[0].id}`);
        console.log(`   Email: ${result.rows[0].email}`);
        console.log(`   Имя: ${result.rows[0].full_name || '-'}`);
        console.log(`   Роль: ${result.rows[0].role}`);
        console.log(`   Создан: ${result.rows[0].created_at}`);
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

createUser();