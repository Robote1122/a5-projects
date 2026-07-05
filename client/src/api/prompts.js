/**
 * api/prompts.js
 * API для управления промптами AI с поддержкой авторизации
 */

import axios from 'axios';

const BASE = '/api/prompts';
axios.defaults.withCredentials = true;

async function promptRequest(method, path, body = null) {
    try {
        const config = {
            method,
            url: `${BASE}${path}`,
            withCredentials: true,
        };

        if (body instanceof FormData) {
            config.data = body;
        } else if (body) {
            config.data = body;
            config.headers = { 'Content-Type': 'application/json' };
        }

        const response = await axios(config);
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            throw new Error(error.response.data.error || 'Ошибка запроса');
        }
        throw new Error('Ошибка соединения с сервером');
    }
}

export const promptsApi = {
    getPrompt: (type) => promptRequest('GET', `/${type}`),
    updatePrompt: (type, content) =>
        promptRequest('POST', `/${type}`, { prompt_type: type, content }),
    uploadPrompt: (type, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return promptRequest('POST', `/${type}/upload`, formData);
    },
    restorePrompt: (type) =>
        promptRequest('POST', `/${type}/restore`),
};