// server/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads/pdfs';
fs.ensureDirSync(UPLOAD_DIR);

// Настройка хранилища multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {        
        // Сохраняем оригинальное имя в req
        req.fileOriginalName = file.originalname;
        
        // Генерируем имя для файловой системы
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const safeName = `file-${uniqueSuffix}${ext}`;
        
        console.log('📄 [MULTER] Имя на диске:', safeName);
        cb(null, safeName);
    }
});

// Фильтр файлов
const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype;
    
    if (mimeType === 'application/pdf' || 
        mimeType === 'application/x-pdf' ||
        ext === '.pdf') {
        console.log('✅ [MULTER] Файл разрешён');
        cb(null, true);
    } else {
        console.log('❌ [MULTER] Файл запрещён');
        cb(new Error('Только PDF файлы разрешены'), false);
    }
};

// Настройка multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024,
        files: 20,
        fieldSize: 10 * 1024 * 1024
    }
});

// Обработка ошибок
const handleMulterError = (err, req, res, next) => {
    console.error('❌ [MULTER] Ошибка:', err);
    
    if (err instanceof multer.MulterError) {
        console.error('❌ [MULTER] Код ошибки:', err.code);
        console.error('❌ [MULTER] Сообщение:', err.message);
        console.error('❌ [MULTER] Поле:', err.field);
        
        const errors = {
            'FILE_TOO_LARGE': 'Файл слишком большой. Максимальный размер: 50MB',
            'LIMIT_FILE_COUNT': 'Слишком много файлов. Максимум: 20',
            'LIMIT_UNEXPECTED_FILE': `Неожиданное поле "${err.field}". Убедитесь, что поле называется "files"`,
            'LIMIT_FILE_SIZE': 'Файл слишком большой. Максимальный размер: 50MB',
            'LIMIT_FIELD_SIZE': 'Слишком большое поле. Уменьшите размер данных'
        };
        
        return res.status(400).json({
            success: false,
            error: errors[err.code] || `Ошибка загрузки: ${err.message}`
        });
    }
    
    if (err) {
        return res.status(400).json({
            success: false,
            error: err.message || 'Ошибка загрузки файла'
        });
    }
    
    next();
};

module.exports = {
    upload,
    handleMulterError,
    UPLOAD_DIR
};