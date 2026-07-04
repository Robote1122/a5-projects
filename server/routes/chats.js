/**
 * routes/chats.js
 * REST API для управления чатами и сообщениями.
 * Использует node:sqlite (встроенный, синхронный API).
 *
 * GET    /api/chats              — список всех чатов
 * POST   /api/chats              — создать новый чат
 * GET    /api/chats/:id          — чат + его сообщения
 * DELETE /api/chats/:id          — удалить чат
 * GET    /api/chats/:id/messages — сообщения чата
 * POST   /api/chats/:id/messages — добавить сообщение
 */

const router = require('express').Router();
const { randomUUID } = require('crypto');
const db = require('../db');
const aiService = require('../services/aiService');

/* ─── helpers ─────────────────────────────────────────── */

function now() {
  return Math.floor(Date.now() / 1000);
}

/* ─── GET /api/chats ─────────────────────────────────── */
router.get('/', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT c.id, c.title, c.created_at, c.updated_at,
             (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
      FROM chats c
      ORDER BY c.updated_at DESC
    `);
    const chats = stmt.all();
    res.json({ success: true, data: chats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── POST /api/chats ────────────────────────────────── */
router.post('/', (req, res) => {
  try {
    const { title = 'Новый чат' } = req.body || {};
    const id = randomUUID();
    const ts = now();
    db.prepare(`INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(id, title.slice(0, 200), ts, ts);
    const chat = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(id);
    res.status(201).json({ success: true, data: chat });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── GET /api/chats/:id ─────────────────────────────── */
router.get('/:id', (req, res) => {
  try {
    const chat = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(req.params.id);
    if (!chat) return res.status(404).json({ success: false, error: 'Чат не найден' });

    const messages = db.prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`).all(req.params.id);
    res.json({ success: true, data: { ...chat, messages } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── DELETE /api/chats/:id ──────────────────────────── */
router.delete('/:id', (req, res) => {
  try {
    const chat = db.prepare(`SELECT id FROM chats WHERE id = ?`).get(req.params.id);
    if (!chat) return res.status(404).json({ success: false, error: 'Чат не найден' });
    db.prepare(`DELETE FROM chats WHERE id = ?`).run(req.params.id);
    res.json({ success: true, message: 'Чат удалён' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── GET /api/chats/:id/messages ────────────────────── */
router.get('/:id/messages', (req, res) => {
  try {
    const chat = db.prepare(`SELECT id FROM chats WHERE id = ?`).get(req.params.id);
    if (!chat) return res.status(404).json({ success: false, error: 'Чат не найден' });

    const messages = db.prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`).all(req.params.id);
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─── POST /api/chats/:id/messages ───────────────────── */
router.post('/:id/messages', async (req, res, next) => {
  try {
    const chat = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(req.params.id);
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Чат не найден' });
    }

    const { role = 'user', content } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'content обязателен' });
    }
    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ success: false, error: 'role должен быть user|assistant|system' });
    }

    // --- НОВАЯ ЛОГИКА ДЛЯ AI ---
    // Если это сообщение от пользователя и AI включен
    if (role === 'user' && process.env.AI_ENABLED !== 'false') {
      // 1. Проверяем лимиты
      const limitCheck = await aiService.checkLimit(req.ip || 'anonymous');
      if (!limitCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Превышен лимит запросов. Попробуйте позже.'
        });
      }

      // 2. Сохраняем сообщение пользователя
      const id = randomUUID();
      const ts = now();
      db.prepare(`INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(id, req.params.id, 'user', content.trim(), ts);

      // Обновляем updated_at
      db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(ts, req.params.id);

      // 3. Получаем историю (последние 10 сообщений)
      const history = db.prepare(`
        SELECT role, content FROM messages 
        WHERE chat_id = ? 
        ORDER BY created_at DESC LIMIT 10
      `).all(req.params.id).reverse();

      // 4. Отправляем в AI сервис со стримингом
      const stream = await aiService.sendMessage(
        req.params.id,
        content.trim(),
        history
      );

      // 5. Отдаем стрим клиенту
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Проксируем стрим от Python сервиса
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = ''; // буфер для неполных SSE-строк между чанками

      // Функция для сохранения полного ответа после завершения
      const saveAssistantMessage = async () => {
        // Сохраняем ответ ассистента в БД
        if (fullResponse) {
          const assistantId = randomUUID();
          const tsNow = now();
          db.prepare(`INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`)
            .run(assistantId, req.params.id, 'assistant', fullResponse, tsNow);
          db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(tsNow, req.params.id);
        }
      };

      // Читаем стрим от Python-сервиса, парсим SSE-события и пересылаем клиенту уже чистый content
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE-события разделены пустой строкой ("\n\n")
          const parts = buffer.split('\n\n');
          buffer = parts.pop(); // последний кусок может быть неполным — оставляем в буфере

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data: ')) continue;

            let payload;
            try {
              payload = JSON.parse(line.slice(6));
            } catch (e) {
              continue; // пропускаем битый JSON
            }

            if (payload.done) {
              continue; // финальный маркер от Python сервиса — сформируем свой в конце
            }
            if (payload.content) {
              fullResponse += payload.content;
              res.write(`data: ${JSON.stringify({ content: payload.content, done: false })}\n\n`);
            }
          }
        }

        // Сохраняем полный ответ в БД
        await saveAssistantMessage();
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();

      } catch (streamError) {
        console.error('[AI Stream Error]', streamError);
        // Пробуем сохранить то, что успели получить
        await saveAssistantMessage();
        res.write(`data: ${JSON.stringify({ error: 'Stream error', done: true })}\n\n`);
        res.end();
      }

      return; // Выходим, т.к. ответ уже отправлен
    }

    // --- СТАРАЯ ЛОГИКА ДЛЯ ОБЫЧНЫХ СООБЩЕНИЙ ---
    // (сохраняется для системных сообщений или если AI выключен)
    const id = randomUUID();
    const ts = now();

    db.prepare(`INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, req.params.id, role, content.trim(), ts);

    if (role === 'user' && chat.title === 'Новый чат') {
      const shortTitle = content.trim().slice(0, 60);
      db.prepare(`UPDATE chats SET title = ?, updated_at = ? WHERE id = ?`)
        .run(shortTitle, ts, req.params.id);
    } else {
      db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(ts, req.params.id);
    }

    const message = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id);
    res.status(201).json({ success: true, data: message });

  } catch (err) {
    console.error('[Messages Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;