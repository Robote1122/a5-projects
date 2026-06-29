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
router.post('/:id/messages', (req, res) => {
  try {
    const chat = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(req.params.id);
    if (!chat) return res.status(404).json({ success: false, error: 'Чат не найден' });

    const { role = 'user', content } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'content обязателен' });
    }
    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ success: false, error: 'role должен быть user|assistant|system' });
    }

    const id = randomUUID();
    const ts = now();

    db.prepare(`INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`).run(id, req.params.id, role, content.trim(), ts);

    // Автоматически переименовать чат по первому сообщению пользователя
    if (role === 'user' && chat.title === 'Новый чат') {
      const shortTitle = content.trim().slice(0, 60);
      db.prepare(`UPDATE chats SET title = ?, updated_at = ? WHERE id = ?`).run(shortTitle, ts, req.params.id);
    } else {
      db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(ts, req.params.id);
    }

    const message = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id);
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
