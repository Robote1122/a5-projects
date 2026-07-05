/**
 * hooks/useChats.js
 * Стейт-менеджер: список чатов, активный чат, сообщения.
 * с поддержкой AI стриминга
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/chats';

export function useChats() {
    const [chats, setChats] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const streamControllerRef = useRef(null);

    /* Загрузить список чатов */
    const loadChats = useCallback(async () => {
        console.log('🔄 [loadChats] Начинаем загрузку чатов...');
        console.log('🔄 [loadChats] Текущее состояние chats:', chats);
        
        try {
            const data = await api.getChats();
            
            console.log('✅ [loadChats] Получены данные:', {
                data,
                type: typeof data,
                isArray: Array.isArray(data),
                length: Array.isArray(data) ? data.length : 'N/A'
            });
            
            // Гарантируем, что chats всегда массив
            const chatsArray = Array.isArray(data) ? data : [];
            console.log('✅ [loadChats] Устанавливаем чаты:', chatsArray);
            setChats(chatsArray);
            
            return chatsArray;
        } catch (e) {
            console.error('❌ [loadChats] Ошибка загрузки чатов:', {
                message: e.message,
                stack: e.stack
            });
            setError(e.message);
            setChats([]); // Всегда массив
        }
    }, []);

    /* Загрузить сообщения активного чата */
    const loadMessages = useCallback(async (chatId) => {
        console.log(`🔄 [loadMessages] Загрузка сообщений для чата ${chatId}`);
        
        if (!chatId) {
            console.warn('⚠️ [loadMessages] chatId не указан');
            return;
        }
        
        setLoading(true);
        try {
            const data = await api.getMessages(chatId);
            console.log(`✅ [loadMessages] Получены сообщения для ${chatId}:`, {
                data,
                isArray: Array.isArray(data),
                count: Array.isArray(data) ? data.length : 'N/A'
            });
            
            const messagesArray = Array.isArray(data) ? data : [];
            setMessages(messagesArray);
        } catch (e) {
            console.error(`❌ [loadMessages] Ошибка загрузки сообщений для ${chatId}:`, e);
            setError(e.message);
            setMessages([]);
        } finally {
            setLoading(false);
        }
    }, []);

    /* Инит */
    useEffect(() => {
        console.log('🚀 [useChats] Инициализация хука');
        loadChats();
    }, [loadChats]);

    /* При смене активного чата — грузим сообщения */
    useEffect(() => {
        console.log(`🔄 [useChats] Смена активного чата: ${activeChatId}`);
        
        if (streamControllerRef.current) {
            streamControllerRef.current.abort();
            streamControllerRef.current = null;
        }
        setIsStreaming(false);
        setStreamingContent('');
        setMessages([]);
        loadMessages(activeChatId);
    }, [activeChatId, loadMessages]);

    /* Создать новый чат */
    const createChat = useCallback(async () => {
        console.log('📝 [createChat] Создание нового чата');
        try {
            const chat = await api.createChat('Новый чат');
            console.log('✅ [createChat] Чат создан:', chat);
            
            // ⭐ Убедимся, что chat - это объект с id
            if (!chat || !chat.id) {
                console.error('❌ [createChat] Неверный формат ответа:', chat);
                throw new Error('Неверный формат ответа от сервера');
            }
            
            setChats(prev => {
                const newChats = [chat, ...prev];
                console.log('📊 [createChat] Обновлённый список чатов:', newChats);
                return newChats;
            });
            
            // ⭐ Устанавливаем активный чат
            setActiveChatId(chat.id);
            console.log('📊 [createChat] Активный чат установлен:', chat.id);
            
        } catch (e) {
            console.error('❌ [createChat] Ошибка создания чата:', e);
            setError(e.message);
        }
    }, []);

    /* Удалить чат */
    const deleteChat = useCallback(async (id) => {
        console.log(`🗑️ [deleteChat] Удаление чата ${id}`);
        try {
            await api.deleteChat(id);
            console.log(`✅ [deleteChat] Чат ${id} удалён`);
            
            setChats(prev => {
                const newChats = prev.filter(c => c.id !== id);
                console.log('📊 [deleteChat] Обновлённый список чатов:', newChats);
                return newChats;
            });
            
            if (activeChatId === id) {
                setActiveChatId(null);
                setMessages([]);
            }
        } catch (e) {
            console.error(`❌ [deleteChat] Ошибка удаления чата ${id}:`, e);
            setError(e.message);
        }
    }, [activeChatId]);

    /* Отправить сообщение */
    const sendMessage = useCallback(async (content) => {
        console.log(`💬 [sendMessage] Отправка сообщения в чат ${activeChatId}:`, content.slice(0, 50));
        
        if (!activeChatId || !content.trim() || sending) {
            console.warn('⚠️ [sendMessage] Пропуск отправки:', {
                hasChatId: !!activeChatId,
                hasContent: !!content.trim(),
                isSending: sending
            });
            return;
        }
        
        setSending(true);
        
        // ... остальной код
    }, [activeChatId, sending]);

    console.log('📊 [useChats] Текущее состояние:', {
        chatsCount: chats.length,
        activeChatId,
        messagesCount: messages.length,
        loading,
        sending,
        error
    });

    return {
        chats,
        activeChatId,
        setActiveChatId,
        messages,
        loading,
        sending,
        error,
        isStreaming,
        streamingContent,
        createChat,
        deleteChat,
        sendMessage,
        reload: loadChats,
    };
}