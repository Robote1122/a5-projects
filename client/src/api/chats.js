/**
 * api/chats.js
 * Все запросы к бэкенду с поддержкой авторизации
 */

import axios from 'axios';

const BASE = '/api';

// Настройка axios для отправки cookie
axios.defaults.withCredentials = true;

// Перехватчик для обработки 401 ошибок
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        console.error('❌ [axios interceptor] Ошибка:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        
        if (error.response?.status === 401) {
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Перехватчик для логирования запросов
axios.interceptors.request.use(
    (config) => {
        console.log(`📤 [${config.method.toUpperCase()}] ${config.url}`, {
            data: config.data,
            headers: config.headers
        });
        return config;
    },
    (error) => {
        console.error('❌ [axios request error]', error);
        return Promise.reject(error);
    }
);

async function request(method, path, data = null) {
    console.log(`🔍 [request] ${method} ${path}`, { data });
    
    try {
        const config = {
            method,
            url: `${BASE}${path}`,
            withCredentials: true,
        };

        if (data) {
            config.data = data;
        }

        const response = await axios(config);
        
        console.log(`✅ [response] ${method} ${path}:`, {
            status: response.status,
            data: response.data,
            dataType: typeof response.data,
            isArray: Array.isArray(response.data),
            hasData: response.data?.data !== undefined,
            dataIsArray: Array.isArray(response.data?.data)
        });
        
        // ⭐ Если ответ содержит обёртку { success: true, data: ... }
        // возвращаем data, иначе возвращаем весь ответ
        if (response.data && response.data.data !== undefined) {
            return response.data.data;
        }
        return response.data;
    } catch (error) {
        console.error(`❌ [request error] ${method} ${path}:`, {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        
        if (error.response?.data) {
            throw new Error(error.response.data.error || 'Ошибка сервера');
        }
        throw new Error('Ошибка соединения с сервером');
    }
}

export const api = {
    getChats: () => {
        console.log('📋 [api.getChats] Вызов');
        return request('GET', '/chats');
    },
    createChat: (title) => {
        console.log('📋 [api.createChat] Вызов', { title });
        return request('POST', '/chats', { title });
    },
    getChat: (id) => {
        console.log('📋 [api.getChat] Вызов', { id });
        return request('GET', `/chats/${id}`);
    },
    deleteChat: (id) => {
        console.log('📋 [api.deleteChat] Вызов', { id });
        return request('DELETE', `/chats/${id}`);
    },
    getMessages: (id) => {
        console.log('📋 [api.getMessages] Вызов', { id });
        return request('GET', `/chats/${id}/messages`);
    },
    sendMessage: (id, role, content) => {
        console.log('📋 [api.sendMessage] Вызов', { id, role, content: content.slice(0, 50) });
        return request('POST', `/chats/${id}/messages`, { role, content });
    },
};