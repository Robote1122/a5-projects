// client/src/api/documents.js
import axios from 'axios';

const BASE = '/api/documents';
axios.defaults.withCredentials = true;

export const documentsApi = {
    uploadFiles: async (files, customNames) => {
        const formData = new FormData();
        
        files.forEach(file => {
            // ⭐ Показываем байты имени файла
            const encoder = new TextEncoder();
            const bytes = encoder.encode(file.name);
            
            formData.append('files', file);
        });
        
        const namesJson = JSON.stringify(customNames);
        
        formData.append('custom_names', namesJson);

        
        try {
            const response = await axios.post(`${BASE}/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
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