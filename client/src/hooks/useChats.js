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
        
        try {
            const data = await api.getChats();
            
            console.log('✅ [loadChats] Получены данные:', {
                data,
                type: typeof data,
                isArray: Array.isArray(data),
                length: Array.isArray(data) ? data.length : 'N/A'
            });
            
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
            setChats([]);
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
            
            if (!chat || !chat.id) {
                console.error('❌ [createChat] Неверный формат ответа:', chat);
                throw new Error('Неверный формат ответа от сервера');
            }
            
            setChats(prev => {
                const newChats = [chat, ...prev];
                console.log('📊 [createChat] Обновлённый список чатов:', newChats);
                return newChats;
            });
            
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
        
        // ⭐ Добавляем сообщение пользователя в локальный стейт (оптимистичное обновление)
        const tempUserMessage = {
            id: 'temp-' + Date.now(),
            chat_id: activeChatId,
            role: 'user',
            content: content.trim(),
            created_at: Math.floor(Date.now() / 1000),
        };
        setMessages(prev => [...prev, tempUserMessage]);
        
        try {
            console.log('📤 [sendMessage] Вызов api.sendMessage...');
            
            // ⭐ Используем fetch для обработки стриминга
            const response = await fetch(`/api/chats/${activeChatId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    role: 'user',
                    content: content.trim()
                }),
                credentials: 'include',
            });
            
            console.log('📊 [sendMessage] Ответ от сервера:', {
                status: response.status,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ [sendMessage] Ошибка сервера:', errorData);
                throw new Error(errorData.error || `Ошибка ${response.status}`);
            }
            
            // Проверяем, стриминг это или обычный ответ
            const contentType = response.headers.get('content-type') || '';
            
            if (contentType.includes('text/event-stream')) {
                // ⭐ Стриминг
                console.log('📡 [sendMessage] Режим стриминга');
                setIsStreaming(true);
                setStreamingContent('');
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullContent = '';
                let buffer = '';
                
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        buffer += decoder.decode(value, { stream: true });
                        const parts = buffer.split('\n\n');
                        buffer = parts.pop() || '';
                        
                        for (const part of parts) {
                            const line = part.trim();
                            if (!line.startsWith('data: ')) continue;
                            
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.done) {
                                    console.log('✅ [sendMessage] Стриминг завершён');
                                    continue;
                                }
                                if (data.content) {
                                    fullContent += data.content;
                                    setStreamingContent(fullContent);
                                }
                                if (data.error) {
                                    console.error('❌ [sendMessage] Ошибка стриминга:', data.error);
                                    throw new Error(data.error);
                                }
                            } catch (parseError) {
                                console.warn('⚠️ [sendMessage] Ошибка парсинга SSE:', parseError);
                            }
                        }
                    }
                    
                    // Сохраняем ответ ассистента
                    if (fullContent) {
                        const assistantMessage = {
                            id: 'assistant-' + Date.now(),
                            chat_id: activeChatId,
                            role: 'assistant',
                            content: fullContent,
                            created_at: Math.floor(Date.now() / 1000),
                        };
                        setMessages(prev => [...prev, assistantMessage]);
                    }
                    
                } catch (streamError) {
                    console.error('❌ [sendMessage] Ошибка стриминга:', streamError);
                    throw streamError;
                } finally {
                    setIsStreaming(false);
                    setStreamingContent('');
                }
            } else {
                // ⭐ Обычный JSON ответ
                console.log('📡 [sendMessage] Обычный режим (не стриминг)');
                const data = await response.json();
                console.log('✅ [sendMessage] Ответ получен:', data);
                
                if (data.success) {
                    // Обновляем список сообщений
                    await loadMessages(activeChatId);
                } else {
                    throw new Error(data.error || 'Ошибка отправки сообщения');
                }
            }
            
        } catch (error) {
            console.error('❌ [sendMessage] Ошибка:', error);
            setError(error.message);
            // Удаляем временное сообщение пользователя при ошибке
            setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
        } finally {
            setSending(false);
        }
    }, [activeChatId, sending, loadMessages]);

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