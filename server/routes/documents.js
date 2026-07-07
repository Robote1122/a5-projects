// server/routes/documents.js
const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');
const documentService = require('../services/documentService');

// Все роуты требуют аутентификации и прав администратора
router.use(authenticate);
router.use(requireRole('ADMIN'));

/**
 * POST /api/documents/upload
 * Загрузка PDF документов
 * 
 * Body: multipart/form-data
 * - files: PDF файлы (до 20)
 * - custom_names: JSON объект { filename: customName, ... }
 */
router.post('/upload', 
    upload.array('files', 20),
    handleMulterError,
    async (req, res) => {
        try {
            console.log('[Documents] Upload request:', {
                files: req.files?.length || 0,
                userId: req.user.id,
                body: req.body
            });
            
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Файлы не выбраны'
                });
            }
            
            // Парсим custom_names
            let customNames = {};
            try {
                if (req.body.custom_names) {
                    customNames = typeof req.body.custom_names === 'string' 
                        ? JSON.parse(req.body.custom_names) 
                        : req.body.custom_names;
                }
            } catch (e) {
                console.warn('[Documents] Ошибка парсинга custom_names:', e);
            }
            
            // Загружаем документы
            const results = await documentService.uploadDocuments(
                req.files,
                customNames,
                req.user.id
            );
            
            // Очищаем временные файлы (если они не были перемещены)
            for (const file of req.files) {
                try {
                    if (await fs.pathExists(file.path)) {
                        // Проверяем, не был ли файл уже перемещён
                        const stat = await fs.stat(file.path);
                        // Если файл существует и это временный файл - удаляем
                        if (file.path.includes('temp-')) {
                            await fs.remove(file.path);
                        }
                    }
                } catch (e) {
                    // Игнорируем ошибки удаления
                }
            }
            
            const successCount = results.filter(r => r.id).length;
            const errorCount = results.filter(r => r.error).length;
            
            res.status(201).json({
                success: true,
                data: {
                    results,
                    summary: {
                        total: results.length,
                        success: successCount,
                        errors: errorCount
                    }
                }
            });
            
        } catch (error) {
            console.error('[Documents] Upload error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Ошибка загрузки документов'
            });
        }
    }
);

/**
 * GET /api/documents
 * Получение списка всех документов
 */
router.get('/', async (req, res) => {
    try {
        const documents = await documentService.getDocuments(req.user.id);
        res.json({
            success: true,
            data: documents
        });
    } catch (error) {
        console.error('[Documents] Get list error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Ошибка получения списка документов'
        });
    }
});

/**
 * GET /api/documents/:id
 * Получение информации о документе
 */
router.get('/:id', async (req, res) => {
    try {
        const doc = await documentService.getDocumentById(req.params.id, req.user.id);
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Документ не найден'
            });
        }
        res.json({
            success: true,
            data: doc
        });
    } catch (error) {
        console.error('[Documents] Get document error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Ошибка получения документа'
        });
    }
});

/**
 * DELETE /api/documents/:id
 * Удаление документа
 */
router.delete('/:id', async (req, res) => {
    try {
        const result = await documentService.deleteDocument(req.params.id, req.user.id);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[Documents] Delete error:', error);
        const status = error.message === 'Документ не найден' ? 404 : 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Ошибка удаления документа'
        });
    }
});

/**
 * POST /api/documents/:id/reprocess
 * Повторная обработка документа
 */
router.post('/:id/reprocess', async (req, res) => {
    try {
        const result = await documentService.reprocessDocument(req.params.id, req.user.id);
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[Documents] Reprocess error:', error);
        const status = error.message === 'Документ не найден' ? 404 : 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Ошибка повторной обработки'
        });
    }
});

/**
 * GET /api/documents/:id/status
 * Проверка статуса обработки
 */
router.get('/:id/status', async (req, res) => {
    try {
        const status = await documentService.getDocumentStatus(req.params.id, req.user.id);
        if (!status) {
            return res.status(404).json({
                success: false,
                error: 'Документ не найден'
            });
        }
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('[Documents] Status error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Ошибка получения статуса'
        });
    }
});

module.exports = router;