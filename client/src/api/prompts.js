/**
 * api/prompts.js
 * API для управления промптами AI
 */

const BASE = '/api/prompts';

// Вспомогательная функция для запросов (без обертки success)
async function promptRequest(method, path, body = null) {
    const options = {
        method,
        headers: {},
    };
    
    // Если body это FormData - отправляем как есть
    if (body instanceof FormData) {
        options.body = body;
    } else if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BASE}${path}`, options);
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || 'Ошибка запроса');
    }
    
    return data;
}

export const promptsApi = {
    /**
     * Получить содержимое промпта
     * @param {string} type - 'start' или 'continue'
     * @returns {Promise<{success: boolean, content: string}>}
     */
    getPrompt: (type) => promptRequest('GET', `/${type}`),
    
    /**
     * Обновить промпт через текст
     * @param {string} type - 'start' или 'continue'
     * @param {string} content - новое содержимое
     * @returns {Promise<{success: boolean, message: string}>}
     */
    updatePrompt: (type, content) => 
        promptRequest('POST', `/${type}`, { prompt_type: type, content }),
    
    /**
     * Загрузить файл промпта (.txt)
     * @param {string} type - 'start' или 'continue'
     * @param {File} file - файл .txt
     * @returns {Promise<{success: boolean, message: string, filename: string}>}
     */
    uploadPrompt: (type, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return promptRequest('POST', `/${type}/upload`, formData);
    },
    
    /**
     * Восстановить промпт из бэкапа
     * @param {string} type - 'start' или 'continue'
     * @returns {Promise<{success: boolean, message: string}>}
     */
    restorePrompt: (type) => 
        promptRequest('POST', `/${type}/restore`),
};