/**
 * routes/chats.js
 * REST API для управления чатами и сообщениями.
 * Использует PostgreSQL.
 */

const router = require('express').Router();
const { randomUUID } = require('crypto');
const pool = require('../db');
const { authenticate, requireOwnership } = require('../middleware/auth');
const aiService = require('../services/aiService');

// Все роуты требуют аутентификации
router.use(authenticate);

/* ─── helpers ─────────────────────────────────────────── */
function now() {
    return new Date(); // ⭐ Используем Date
}

/* ─── GET /api/chats ─────────────────────────────────── */
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                c.id, 
                c.title, 
                c.created_at, 
                c.updated_at,
                (
                    SELECT content 
                    FROM messages 
                    WHERE chat_id = c.id 
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) AS last_message
            FROM chats c
            WHERE c.user_id = $1
            ORDER BY c.updated_at DESC
        `, [req.user.id]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[GET /chats] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── POST /api/chats ────────────────────────────────── */
router.post('/', async (req, res) => {
    try {
        const { title = 'Новый чат' } = req.body || {};
        const id = randomUUID();
        
        await pool.query(
            `INSERT INTO chats (id, user_id, title, created_at, updated_at) 
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [id, req.user.id, title.slice(0, 200)]
        );
        
        const result = await pool.query(
            'SELECT * FROM chats WHERE id = $1',
            [id]
        );
        
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[POST /chats] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── GET /api/chats/:id ─────────────────────────────── */
router.get('/:id', requireOwnership, async (req, res) => {
    try {
        const chatResult = await pool.query(
            'SELECT * FROM chats WHERE id = $1',
            [req.params.id]
        );
        
        if (chatResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Чат не найден' });
        }
        
        const messagesResult = await pool.query(
            'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );
        
        const chat = chatResult.rows[0];
        chat.messages = messagesResult.rows;
        
        res.json({ success: true, data: chat });
    } catch (err) {
        console.error('[GET /chats/:id] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── DELETE /api/chats/:id ──────────────────────────── */
router.delete('/:id', requireOwnership, async (req, res) => {
    try {
        await pool.query('DELETE FROM chats WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Чат удалён' });
    } catch (err) {
        console.error('[DELETE /chats/:id] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── GET /api/chats/:id/messages ────────────────────── */
router.get('/:id/messages', requireOwnership, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[GET /chats/:id/messages] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* ─── POST /api/chats/:id/messages ───────────────────── */
router.post('/:id/messages', requireOwnership, async (req, res) => {
    console.log('\n💬 ====== POST /chats/:id/messages ======');
    console.log('📝 Chat ID:', req.params.id);
    console.log('📝 User ID:', req.user.id);
    console.log('📝 Body:', req.body);
    console.log('📝 Role:', req.body.role);
    console.log('📝 Content length:', req.body.content?.length || 0);
    
    try {
        const { role = 'user', content } = req.body || {};
        
        if (!content || !content.trim()) {
            console.log('❌ Content is empty');
            return res.status(400).json({ success: false, error: 'content обязателен' });
        }
        if (!['user', 'assistant', 'system'].includes(role)) {
            console.log('❌ Invalid role:', role);
            return res.status(400).json({ success: false, error: 'role должен быть user|assistant|system' });
        }
        
        // Проверяем, что чат существует
        console.log('🔍 Проверяем существование чата...');
        const chatResult = await pool.query(
            'SELECT title FROM chats WHERE id = $1',
            [req.params.id]
        );
        
        if (chatResult.rows.length === 0) {
            console.log('❌ Чат не найден');
            return res.status(404).json({ success: false, error: 'Чат не найден' });
        }
        
        const chat = chatResult.rows[0];
        console.log('✅ Чат найден:', chat.title);
        
        const ts = now();
        const messageId = randomUUID();
        
        // --- ЛОГИКА ДЛЯ AI ---
        if (role === 'user' && process.env.AI_ENABLED !== 'false') {
            console.log('🤖 AI режим включен');
            
            // 1. Проверяем лимиты
            console.log('🔍 Проверяем лимиты...');
            const limitCheck = await aiService.checkLimit(req.user.id);
            console.log('📊 Лимиты:', limitCheck);
            
            if (!limitCheck.allowed) {
                console.log('❌ Превышен лимит');
                return res.status(429).json({
                    success: false,
                    error: 'Превышен лимит запросов. Попробуйте позже.'
                });
            }
            
            // 2. Сохраняем сообщение пользователя
            await pool.query(
                `INSERT INTO messages (id, chat_id, role, content, created_at) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [messageId, req.params.id, 'user', content.trim(), ts]
            );
            console.log('✅ Сообщение пользователя сохранено');
            
            // 3. Обновляем updated_at чата
            await pool.query(
                'UPDATE chats SET updated_at = $1 WHERE id = $2',
                [ts, req.params.id]
            );
            console.log('✅ updated_at обновлён');
            
            // 4. Если чат новый - обновляем заголовок
            if (chat.title === 'Новый чат') {
                const shortTitle = content.trim().slice(0, 60);
                await pool.query(
                    'UPDATE chats SET title = $1 WHERE id = $2',
                    [shortTitle, req.params.id]
                );
                console.log('✅ Заголовок обновлён:', shortTitle);
            }
            
            // 5. Получаем историю (последние 10 сообщений)
            const historyResult = await pool.query(
                `SELECT role, content FROM messages 
                 WHERE chat_id = $1 
                 ORDER BY created_at DESC LIMIT 10`,
                [req.params.id]
            );
            const history = historyResult.rows.reverse();
            console.log('📚 История загружена, сообщений:', history.length);
            
            // 6. Отправляем в AI сервис со стримингом
            console.log('🔄 Отправляем запрос в AI сервис...');
            const stream = await aiService.sendMessage(
                req.params.id,
                content.trim(),
                history
            );
            console.log('✅ AI сервис ответил');
            
            // 7. Отдаем стрим клиенту
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            let buffer = '';
            
            // Функция для сохранения ответа ассистента
            const saveAssistantMessage = async () => {
                if (fullResponse) {
                    console.log('💾 Сохраняем ответ ассистента...');
                    const assistantId = randomUUID();
                    const tsNow = now();
                    await pool.query(
                        `INSERT INTO messages (id, chat_id, role, content, created_at) 
                         VALUES ($1, $2, $3, $4, $5)`,
                        [assistantId, req.params.id, 'assistant', fullResponse, tsNow]
                    );
                    await pool.query(
                        'UPDATE chats SET updated_at = $1 WHERE id = $2',
                        [tsNow, req.params.id]
                    );
                    console.log('✅ Ответ ассистента сохранён');
                }
            };
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split('\n\n');
                    buffer = parts.pop();
                    
                    for (const part of parts) {
                        const line = part.trim();
                        if (!line.startsWith('data: ')) continue;
                        
                        try {
                            const payload = JSON.parse(line.slice(6));
                            if (payload.done) continue;
                            if (payload.content) {
                                fullResponse += payload.content;
                                res.write(`data: ${JSON.stringify({ content: payload.content, done: false })}\n\n`);
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
                
                await saveAssistantMessage();
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                res.end();
                console.log('✅ Стриминг завершён');
                return; // ⭐ ВАЖНО: завершаем обработку
                
            } catch (streamError) {
                console.error('[AI Stream Error]', streamError);
                await saveAssistantMessage();
                res.write(`data: ${JSON.stringify({ error: 'Stream error', done: true })}\n\n`);
                res.end();
                return; // ⭐ ВАЖНО: завершаем обработку
            }
        }
        
        // --- ОБЫЧНОЕ СООБЩЕНИЕ (без AI) ---
        console.log('📝 Обычный режим (без AI)');
        await pool.query(
            `INSERT INTO messages (id, chat_id, role, content, created_at) 
             VALUES ($1, $2, $3, $4, $5)`,
            [messageId, req.params.id, role, content.trim(), ts]
        );
        console.log('✅ Сообщение сохранено');
        
        // Обновляем заголовок, если чат новый
        if (role === 'user' && chat.title === 'Новый чат') {
            const shortTitle = content.trim().slice(0, 60);
            await pool.query(
                'UPDATE chats SET title = $1, updated_at = $2 WHERE id = $3',
                [shortTitle, ts, req.params.id]
            );
            console.log('✅ Заголовок обновлён:', shortTitle);
        } else {
            await pool.query(
                'UPDATE chats SET updated_at = $1 WHERE id = $2',
                [ts, req.params.id]
            );
            console.log('✅ updated_at обновлён');
        }
        
        const result = await pool.query(
            'SELECT * FROM messages WHERE id = $1',
            [messageId]
        );
        
        console.log('✅ Ответ отправлен');
        res.status(201).json({ success: true, data: result.rows[0] });
        
    } catch (err) {
        console.error('[POST /chats/:id/messages] Error:', err);
        console.error('Stack:', err.stack);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;