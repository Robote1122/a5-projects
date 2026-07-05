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
        if (error.response?.status === 401) {
            // Редирект на логин
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

async function request(method, path, data = null) {
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
        return response.data;
    } catch (error) {
        if (error.response?.data) {
            throw new Error(error.response.data.error || 'Ошибка сервера');
        }
        throw new Error('Ошибка соединения с сервером');
    }
}

export const api = {
    getChats: () => request('GET', '/chats'),
    createChat: (title) => request('POST', '/chats', { title }),
    getChat: (id) => request('GET', `/chats/${id}`),
    deleteChat: (id) => request('DELETE', `/chats/${id}`),
    getMessages: (id) => request('GET', `/chats/${id}/messages`),
    sendMessage: (id, role, content) =>
        request('POST', `/chats/${id}/messages`, { role, content }),
};