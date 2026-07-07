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
        // Временное имя, позже будет заменено на UUID
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `temp-${uniqueSuffix}-${file.originalname}`);
    }
});

// Фильтр файлов - только PDF
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/x-pdf' ||
        path.extname(file.originalname).toLowerCase() === '.pdf') {
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