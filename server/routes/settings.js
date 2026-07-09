// server/routes/settings.js
const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// Получить все настройки
router.get('/', authenticate, async (req, res) => {
    try {
        const result = await pool.query('SELECT key, value, updated_at FROM settings');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получить конкретную настройку
router.get('/:key', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT value, updated_at FROM settings WHERE key = $1',
            [req.params.key]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Настройка не найдена' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Обновить настройку (только для админов)
router.put('/:key', authenticate, requireRole('ADMIN'), async (req, res) => {
    try {
        const { value } = req.body;
        if (!value) {
            return res.status(400).json({ success: false, error: 'Значение обязательно' });
        }
        
        await pool.query(
            `INSERT INTO settings (key, value, updated_at) 
             VALUES ($1, $2, CURRENT_TIMESTAMP) 
             ON CONFLICT (key) DO UPDATE 
             SET value = $2, updated_at = CURRENT_TIMESTAMP`,
            [req.params.key, value]
        );
        
        // ⭐ Оповещаем AI-сервис об изменении
        await fetch(`${process.env.AI_SERVICE_URL}/api/ai/settings/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: req.params.key, value })
        });
        
        res.json({ 
            success: true, 
            message: 'Настройка обновлена',
            data: { key: req.params.key, value }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;