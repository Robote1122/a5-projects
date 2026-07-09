// server/routes/documents.js
const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');
const documentService = require('../services/documentService');

function logStringDetails(label, str, prefix = '') {
    if (!str) {
        console.log(`${prefix}${label}: (пустая строка)`);
        return;
    }
    console.log(`${prefix}${label}: "${str}"`);
    console.log(`${prefix}  Длина: ${str.length}`);
    console.log(`${prefix}  Коды символов:`, Array.from(str).map(c => c.charCodeAt(0)));
    console.log(`${prefix}  Байты (UTF-8):`, Array.from(new TextEncoder().encode(str)));
}

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
            if (!req.files || req.files.length === 0) {
                console.log('❌ [ROUTER] Нет файлов');
                return res.status(400).json({
                    success: false,
                    error: 'Файлы не выбраны'
                });
            }
            
            // ⭐ Логируем каждый файл
            req.files.forEach((file, index) => {
                logStringDetails('  originalname (детально)', file.originalname);
                logStringDetails('  filename (детально)', file.filename);
            });
            
            // ⭐ Парсим custom_names
            let customNames = {};
            try {
                if (req.body.custom_names) {
                    console.log('📤 [ROUTER] custom_names raw:', req.body.custom_names);
                    logStringDetails('custom_names raw', req.body.custom_names);
                    
                    let raw = req.body.custom_names;
                    if (typeof raw === 'string') {
                        console.log('📤 [ROUTER] Парсим JSON:', raw);
                        customNames = JSON.parse(raw);
                    } else {
                        customNames = raw;
                    }
                    console.log('📤 [ROUTER] customNames после парсинга:', customNames);
                }
            } catch (e) {
                console.error('❌ [ROUTER] Ошибка парсинга custom_names:', e);
                customNames = {};
            }
            
            // ⭐ Подготавливаем файлы
            const preparedFiles = req.files.map((file) => {
                const originalName = file.originalname;
                const customName = customNames[originalName] || 
                                  originalName.replace(/\.[^/.]+$/, '');
                
                console.log(`\n📄 [ROUTER] Подготовка файла: "${originalName}"`);
                console.log(`  customName: "${customName}"`);
                logStringDetails('  customName (детально)', customName);
                
                return {
                    ...file,
                    originalName: originalName,
                    customName: customName,
                    path: file.path
                };
            });
            
            // ⭐ Загружаем документы
            console.log('📤 [ROUTER] Вызов documentService.uploadDocuments');
            const results = await documentService.uploadDocuments(
                preparedFiles,
                req.user.id
            );
            console.log('📥 [ROUTER] Результат загрузки:', results);
            
            // Очищаем временные файлы
            for (const file of req.files) {
                try {
                    if (await fs.pathExists(file.path)) {
                        await fs.remove(file.path);
                        console.log(`🗑️ [ROUTER] Удалён временный файл: ${file.path}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ [ROUTER] Не удалось удалить ${file.path}:`, e);
                }
            }
            
            const successCount = results.filter(r => r.id).length;
            const errorCount = results.filter(r => r.error).length;
            
            console.log('📊 [ROUTER] Итог:', {
                total: results.length,
                success: successCount,
                errors: errorCount
            });
            
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
            console.error('❌ [ROUTER] Ошибка:', error);
            console.error('❌ [ROUTER] Stack:', error.stack);
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