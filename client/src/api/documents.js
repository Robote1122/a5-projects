// client/src/api/documents.js
import axios from 'axios';

const BASE = '/api/documents';

axios.defaults.withCredentials = true;

/**
 * Загрузка PDF-документов
 * @param {File[]} files - массив файлов
 * @param {Object} customNames - объект { fileName: customName, ... }
 */
export const documentsApi = {
    uploadFiles: async (files, customNames) => {
        const formData = new FormData();
        
        files.forEach(file => {
            formData.append('files', file);
        });
        
        formData.append('custom_names', JSON.stringify(customNames));
        
        const response = await axios.post(`${BASE}/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        
        return response.data;
    },

    getDocuments: async () => {
        const response = await axios.get(BASE);
        return response.data;
    },

    getDocument: async (id) => {
        const response = await axios.get(`${BASE}/${id}`);
        return response.data;
    },

    deleteDocument: async (id) => {
        const response = await axios.delete(`${BASE}/${id}`);
        return response.data;
    },

    reprocessDocument: async (id) => {
        const response = await axios.post(`${BASE}/${id}/reprocess`);
        return response.data;
    },

    getDocumentStatus: async (id) => {
        const response = await axios.get(`${BASE}/${id}/status`);
        return response.data;
    },
};