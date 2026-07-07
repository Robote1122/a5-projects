// server/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads/pdfs';

// Убедимся, что директория существует
fs.ensureDirSync(UPLOAD_DIR);

// Настройка хранилища multer (временное хранилище)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        // ⭐ КОРРЕКТНАЯ ОБРАБОТКА UTF-8
        // 1. Декодируем имя из Latin-1 в UTF-8
        let originalName = file.originalname;
        
        // Пробуем разные способы декодирования
        try {
            // Способ 1: Если имя пришло как Latin-1
            originalName = Buffer.from(originalName, 'latin1').toString('utf8');
        } catch (e) {
            // Способ 2: Пробуем просто как UTF-8
            try {
                originalName = decodeURIComponent(escape(originalName));
            } catch (e2) {
                // Оставляем как есть
            }
        }
        
        // Сохраняем правильное имя в req для дальнейшего использования
        req.fileOriginalName = originalName;
        
        // Генерируем уникальное имя для файла на диске
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        // Очищаем имя от недопустимых символов для файловой системы
        const safeName = baseName.replace(/[^a-zA-Zа-яА-Я0-9-_]/g, '_');
        cb(null, `${safeName}-${uniqueSuffix}${ext}`);
    }
});


// Фильтр файлов - только PDF
const fileFilter = (req, file, cb) => {
    // ⭐ Нормализуем имя файла
    let originalName = file.originalname;
    try {
        originalName = Buffer.from(originalName, 'latin1').toString('utf8');
    } catch (e) {}
    
    const ext = path.extname(originalName).toLowerCase();
    const mimeType = file.mimetype;
    
    if (mimeType === 'application/pdf' || 
        mimeType === 'application/x-pdf' ||
        ext === '.pdf') {
        cb(null, true);
    } else {
        cb(new Error('Только PDF файлы разрешены'), false);
    }
};

// Настройка multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
        files: 20 // максимум 20 файлов
    }
});

// Middleware для обработки ошибок multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
            return res.status(413).json({
                success: false,
                error: 'Файл слишком большой. Максимальный размер: 50MB'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Слишком много файлов. Максимум: 20'
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                error: 'Неожиданное поле. Убедитесь, что поле называется "files"'
            });
        }
        return res.status(400).json({
            success: false,
            error: `Ошибка загрузки: ${err.message}`
        });
    }
    
    if (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
    
    next();
};

module.exports = {
    upload,
    handleMulterError,
    UPLOAD_DIR
};