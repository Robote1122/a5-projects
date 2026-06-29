/**
 * hooks/useChats.js
 * Стейт-менеджер: список чатов, активный чат, сообщения.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/chats';

export function useChats() {
  const [chats, setChats]         = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState(null);

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

  /* Отправить сообщение */
  const sendMessage = useCallback(async (content) => {
    if (!activeChatId || !content.trim() || sending) return;
    setSending(true);
    try {
      const msg = await api.sendMessage(activeChatId, 'user', content.trim());
      setMessages(prev => [...prev, msg]);

      // Обновить превью в сайдбаре
      setChats(prev => prev.map(c =>
        c.id === activeChatId
          ? { ...c, title: c.title === 'Новый чат' ? content.trim().slice(0, 60) : c.title, last_message: content.trim(), updated_at: Math.floor(Date.now() / 1000) }
          : c
      ));
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }, [activeChatId, sending]);

  /* Добавить ответ (от внешнего AI / вручную) */
  const addAssistantMessage = useCallback(async (content) => {
    if (!activeChatId) return;
    try {
      const msg = await api.sendMessage(activeChatId, 'assistant', content);
      setMessages(prev => [...prev, msg]);
    } catch (e) {
      setError(e.message);
    }
  }, [activeChatId]);

  return {
    chats, activeChatId, setActiveChatId,
    messages, loading, sending, error,
    createChat, deleteChat, sendMessage, addAssistantMessage,
    reload: loadChats,
  };
}
