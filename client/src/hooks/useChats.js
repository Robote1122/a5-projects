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
  
  // Состояния для стриминга
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const streamControllerRef = useRef(null);

  /* Загрузить список чатов */
  const loadChats = useCallback(async () => {
    try {
      const data = await api.getChats();
      setChats(data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  /* Загрузить сообщения активного чата */
  const loadMessages = useCallback(async (chatId) => {
    if (!chatId) return;
    setLoading(true);
    try {
      const data = await api.getMessages(chatId);
      setMessages(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  /* Инит */
  useEffect(() => { loadChats(); }, [loadChats]);

  /* При смене активного чата — грузим сообщения */
  useEffect(() => {
    // Отменяем текущий стриминг при смене чата
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
    try {
      const chat = await api.createChat('Новый чат');
      setChats(prev => [chat, ...prev]);
      setActiveChatId(chat.id);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  /* Удалить чат */
  const deleteChat = useCallback(async (id) => {
    try {
      await api.deleteChat(id);
      setChats(prev => prev.filter(c => c.id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
        setMessages([]);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [activeChatId]);

  /* Отправить сообщение (с поддержкой стриминга) */
  const sendMessage = useCallback(async (content) => {
    if (!activeChatId || !content.trim() || sending) return;
    
    setSending(true);
    
    // Добавляем сообщение пользователя локально (оптимистично)
    const tempUserMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      created_at: Math.floor(Date.now() / 1000),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    // Обновляем превью в сайдбаре
    setChats(prev => prev.map(c =>
      c.id === activeChatId
        ? { 
            ...c, 
            title: c.title === 'Новый чат' ? content.trim().slice(0, 60) : c.title, 
            last_message: content.trim(), 
            updated_at: Math.floor(Date.now() / 1000) 
          }
        : c
    ));

    try {
      // Отправляем запрос на сервер с ожиданием стрима
      const response = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          role: 'user', 
          content: content.trim() 
        }),
        // Используем AbortController для отмены
        signal: streamControllerRef.current?.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Получаем стрим
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      
      setIsStreaming(true);
      setStreamingContent('');

      // Читаем стрим
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.done) {
                // Стриминг завершен
                setIsStreaming(false);
                setStreamingContent('');
                
                // Сохраняем полный ответ ассистента
                if (fullResponse) {
                  const assistantMsg = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: fullResponse,
                    created_at: Math.floor(Date.now() / 1000),
                  };
                  setMessages(prev => [...prev, assistantMsg]);
                  
                  // Обновляем превью в сайдбаре
                  setChats(prev => prev.map(c =>
                    c.id === activeChatId
                      ? { ...c, last_message: fullResponse.slice(0, 60), updated_at: Math.floor(Date.now() / 1000) }
                      : c
                  ));
                }
              } else if (data.content) {
                console.log(data)
                fullResponse += data.content;
                setStreamingContent(fullResponse);
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }
        }
      }

    } catch (error) {
      console.error('[Send Message Error]', error);
      setError(error.message);
      
      // Удаляем временное сообщение пользователя при ошибке
      setMessages(prev => prev.filter(msg => msg.id !== tempUserMsg.id));
      
      // Показываем сообщение об ошибке
      const errorMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Извините, произошла ошибка при обработке сообщения. Попробуйте позже.',
        created_at: Math.floor(Date.now() / 1000),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
      setIsStreaming(false);
      setStreamingContent('');
      streamControllerRef.current = null;
    }
  }, [activeChatId, sending]);

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