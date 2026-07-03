/**
 * routes/prompts.js
 * Прокси для управления промптами AI сервиса
 */

const router = require('express').Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8002';

// Вспомогательная функция для запросов к AI
async function proxyRequest(method, path, body = null) {
    const url = `${AI_SERVICE_URL}/api/ai/prompt/${path}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    return response;
}

// Получить промпт
router.get('/:type', async (req, res) => {
    try {
        const response = await proxyRequest('GET', req.params.type);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('[Prompt Proxy] GET error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка получения промпта' 
        });
    }
});

// Обновить промпт через текст
router.post('/:type', async (req, res) => {
    try {
        const response = await proxyRequest('POST', req.params.type, req.body);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('[Prompt Proxy] POST error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка обновления промпта' 
        });
    }
});

// Восстановить из бэкапа
router.post('/:type/restore', async (req, res) => {
    try {
        const response = await proxyRequest('POST', `${req.params.type}/restore`);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('[Prompt Proxy] Restore error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка восстановления промпта' 
        });
    }
});

// Загрузить файл (особый случай - multipart/form-data)
router.post('/:type/upload', async (req, res) => {
    try {
        // Получаем файл из запроса
        if (!req.files || !req.files.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'Файл не найден' 
            });
        }

        const file = req.files.file;
        const formData = new FormData();
        formData.append('file', file.data, file.name);

        const response = await fetch(
            `${AI_SERVICE_URL}/api/ai/prompt/${req.params.type}/upload`,
            {
                method: 'POST',
                body: formData,
            }
        );

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('[Prompt Proxy] Upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка загрузки файла' 
        });
    }
});

module.exports = router;