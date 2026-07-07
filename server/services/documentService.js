// server/services/documentService.js
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8002';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads/pdfs';

// Убедимся, что директория существует
fs.ensureDirSync(UPLOAD_DIR);

class DocumentService {
    /**
     * Загрузка документов
     */
    async uploadDocuments(files, customNames, userId) {
        const results = [];
        
        for (const file of files) {
            try {
                // 1. Генерируем уникальное имя для файла
                const uniqueId = uuidv4();
                const fileExt = path.extname(file.originalname);
                const uniqueFilename = `${uniqueId}${fileExt}`;
                const filePath = path.join(UPLOAD_DIR, uniqueFilename);
                
                // 2. Сохраняем файл
                await fs.move(file.path, filePath, { overwrite: true });
                
                // 3. Получаем custom_name
                const customName = customNames[file.originalname] || 
                                  file.originalname.replace(/\.[^/.]+$/, '');
                
                // 4. Создаём запись в БД
                const docId = uuidv4();
                const query = `
                    INSERT INTO documents (
                        id, user_id, original_name, custom_name, 
                        file_path, file_size, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                    RETURNING id, original_name, custom_name, status, created_at
                `;
                
                const result = await pool.query(query, [
                    docId,
                    userId,
                    file.originalname,
                    customName,
                    filePath,
                    file.size
                ]);
                
                const doc = result.rows[0];
                
                // 5. Отправляем на обработку в AI-сервис (асинхронно)
                this.processDocumentAsync(docId, filePath, customName, userId);
                
                results.push({
                    id: docId,
                    original_name: doc.original_name,
                    custom_name: doc.custom_name,
                    status: 'pending',
                    created_at: doc.created_at
                });
                
            } catch (error) {
                console.error(`[DocumentService] Ошибка загрузки ${file.originalname}:`, error);
                results.push({
                    original_name: file.originalname,
                    error: error.message,
                    status: 'error'
                });
            }
        }
        
        return results;
    }
    
    /**
     * Асинхронная обработка документа в AI-сервисе
     */
    async processDocumentAsync(docId, filePath, customName, userId) {
        try {
            // Обновляем статус на processing
            await pool.query(
                'UPDATE documents SET status = $1 WHERE id = $2',
                ['processing', docId]
            );
            
            // Отправляем запрос в AI-сервис
            const formData = new FormData();
            formData.append('document_id', docId);
            formData.append('custom_name', customName);
            formData.append('file', fs.createReadStream(filePath));
            
            const response = await axios.post(
                `${AI_SERVICE_URL}/api/ai/documents/process`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        'X-User-Id': userId
                    },
                    timeout: 300000 // 5 минут
                }
            );
            
            if (response.data.success) {
                // Обновляем статус на completed
                await pool.query(
                    `UPDATE documents 
                     SET status = 'completed', 
                         page_count = $1, 
                         chunk_count = $2,
                         processed_at = CURRENT_TIMESTAMP
                     WHERE id = $3`,
                    [
                        response.data.page_count || 0,
                        response.data.chunk_count || 0,
                        docId
                    ]
                );
                console.log(`✅ Документ ${customName} обработан успешно`);
            } else {
                throw new Error(response.data.error || 'Ошибка обработки');
            }
            
        } catch (error) {
            console.error(`[DocumentService] Ошибка обработки документа ${docId}:`, error);
            await pool.query(
                `UPDATE documents 
                 SET status = 'error', 
                     error_message = $1 
                 WHERE id = $2`,
                [error.message || 'Неизвестная ошибка', docId]
            );
        }
    }
    
    /**
     * Получение списка документов
     */
    async getDocuments(userId) {
        const query = `
            SELECT 
                id, 
                original_name, 
                custom_name, 
                status, 
                page_count, 
                chunk_count,
                file_size,
                error_message,
                created_at,
                processed_at
            FROM documents 
            WHERE user_id = $1 AND status != 'deleted'
            ORDER BY created_at DESC
        `;
        
        const result = await pool.query(query, [userId]);
        return result.rows;
    }
    
    /**
     * Получение документа по ID
     */
    async getDocumentById(docId, userId) {
        const query = `
            SELECT 
                id, 
                original_name, 
                custom_name, 
                status, 
                page_count, 
                chunk_count,
                file_size,
                file_path,
                error_message,
                created_at,
                processed_at
            FROM documents 
            WHERE id = $1 AND user_id = $2 AND status != 'deleted'
        `;
        
        const result = await pool.query(query, [docId, userId]);
        return result.rows[0] || null;
    }
    
    /**
     * Удаление документа
     */
    async deleteDocument(docId, userId) {
        // 1. Получаем информацию о документе
        const doc = await this.getDocumentById(docId, userId);
        if (!doc) {
            throw new Error('Документ не найден');
        }
        
        // 2. Удаляем физический файл
        try {
            if (doc.file_path && await fs.pathExists(doc.file_path)) {
                await fs.remove(doc.file_path);
            }
        } catch (error) {
            console.warn(`[DocumentService] Не удалось удалить файл ${doc.file_path}:`, error);
        }
        
        // 3. Удаляем из ChromaDB через AI-сервис
        try {
            await axios.delete(
                `${AI_SERVICE_URL}/api/ai/documents/${docId}`,
                {
                    headers: { 'X-User-Id': userId }
                }
            );
        } catch (error) {
            console.warn(`[DocumentService] Не удалось удалить из ChromaDB ${docId}:`, error);
        }
        
        // 4. Обновляем статус в БД
        await pool.query(
            `UPDATE documents 
             SET status = 'deleted', 
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1 AND user_id = $2`,
            [docId, userId]
        );
        
        return { success: true, message: 'Документ удалён' };
    }
    
    /**
     * Повторная обработка документа
     */
    async reprocessDocument(docId, userId) {
        const doc = await this.getDocumentById(docId, userId);
        if (!doc) {
            throw new Error('Документ не найден');
        }
        
        if (doc.status === 'processing') {
            throw new Error('Документ уже обрабатывается');
        }
        
        // Обновляем статус
        await pool.query(
            'UPDATE documents SET status = $1, error_message = NULL WHERE id = $2',
            ['pending', docId]
        );
        
        // Запускаем обработку заново
        await this.processDocumentAsync(
            docId,
            doc.file_path,
            doc.custom_name,
            userId
        );
        
        return { success: true, message: 'Документ отправлен на повторную обработку' };
    }
    
    /**
     * Проверка статуса документа
     */
    async getDocumentStatus(docId, userId) {
        const query = `
            SELECT 
                status, 
                page_count, 
                chunk_count,
                error_message,
                processed_at
            FROM documents 
            WHERE id = $1 AND user_id = $2 AND status != 'deleted'
        `;
        
        const result = await pool.query(query, [docId, userId]);
        return result.rows[0] || null;
    }
}

module.exports = new DocumentService();