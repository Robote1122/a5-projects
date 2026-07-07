// client/src/api/documents.js
import axios from 'axios';

const BASE = '/api/documents';
axios.defaults.withCredentials = true;

export const documentsApi = {
    uploadFiles: async (files, customNames) => {
        console.log('📤 [FRONTEND] Начинаем загрузку файлов');
        console.log('📤 [FRONTEND] Количество файлов:', files.length);
        console.log('📤 [FRONTEND] Имена файлов (оригинальные):', files.map(f => ({
            name: f.name,
            nameLength: f.name.length,
            nameChars: Array.from(f.name).map(c => c.charCodeAt(0))
        })));
        console.log('📤 [FRONTEND] customNames:', customNames);
        console.log('📤 [FRONTEND] customNames (JSON):', JSON.stringify(customNames));
        
        const formData = new FormData();
        
        files.forEach(file => {
            console.log(`📤 [FRONTEND] Добавляем файл: ${file.name}`);
            console.log(`📤 [FRONTEND] Размер файла: ${file.size} байт`);
            console.log(`📤 [FRONTEND] Тип файла: ${file.type}`);
            
            // ⭐ Показываем байты имени файла
            const encoder = new TextEncoder();
            const bytes = encoder.encode(file.name);
            console.log(`📤 [FRONTEND] Имя в байтах (UTF-8):`, Array.from(bytes));
            
            formData.append('files', file);
        });
        
        const namesJson = JSON.stringify(customNames);
        console.log('📤 [FRONTEND] custom_names JSON:', namesJson);
        console.log('📤 [FRONTEND] custom_names в байтах (UTF-8):', Array.from(new TextEncoder().encode(namesJson)));
        
        formData.append('custom_names', namesJson);
        
        // ⭐ Логируем все поля FormData
        console.log('📤 [FRONTEND] Формируем FormData...');
        for (let pair of formData.entries()) {
            if (pair[0] === 'files') {
                console.log(`📤 [FRONTEND] FormData: ${pair[0]} = ${pair[1].name} (${pair[1].size} bytes)`);
            } else {
                console.log(`📤 [FRONTEND] FormData: ${pair[0]} = ${pair[1]}`);
            }
        }
        
        console.log('📤 [FRONTEND] Отправляем запрос на /api/documents/upload');
        
        try {
            const response = await axios.post(`${BASE}/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            
            console.log('📥 [FRONTEND] Ответ получен:', response.data);
            return response.data;
        } catch (error) {
            console.error('❌ [FRONTEND] Ошибка загрузки:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    },

    getDocuments: async () => {
        console.log('📤 [FRONTEND] Запрос списка документов');
        const response = await axios.get(BASE);
        console.log('📥 [FRONTEND] Получены документы:', response.data);
        return response.data;
    },

    deleteDocument: async (id) => {
        console.log(`📤 [FRONTEND] Удаление документа ${id}`);
        const response = await axios.delete(`${BASE}/${id}`);
        console.log(`📥 [FRONTEND] Документ ${id} удалён`, response.data);
        return response.data;
    },

    reprocessDocument: async (id) => {
        console.log(`📤 [FRONTEND] Повторная обработка документа ${id}`);
        const response = await axios.post(`${BASE}/${id}/reprocess`);
        console.log(`📥 [FRONTEND] Документ ${id} отправлен на обработку`, response.data);
        return response.data;
    },

    getDocumentStatus: async (id) => {
        console.log(`📤 [FRONTEND] Проверка статуса документа ${id}`);
        const response = await axios.get(`${BASE}/${id}/status`);
        console.log(`📥 [FRONTEND] Статус документа ${id}:`, response.data);
        return response.data;
    },
};