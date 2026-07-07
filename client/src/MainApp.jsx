/**
 * MainApp.jsx
 * Основное приложение чата (требует авторизации)
 */

import React, { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import ChatWindow from './components/ChatWindow';
import MessageInput from './components/MessageInput';
import { useChats } from './hooks/useChats';
import PromptManager from './components/PromptManager';

export default function MainApp() {
    console.log('🏠 [MainApp] Рендер компонента');
    
    const {
        chats,
        activeChatId,
        setActiveChatId,
        messages,
        loading,
        sending,
        isStreaming,
        streamingContent,
        createChat,
        deleteChat,
        sendMessage,
    } = useChats();

    // Логируем состояние при каждом изменении
    useEffect(() => {
        console.log('📊 [MainApp] Состояние обновлено:', {
            chatsCount: chats.length,
            chatsType: typeof chats,
            isArray: Array.isArray(chats),
            activeChatId,
            messagesCount: messages.length,
            loading
        });
    }, [chats, activeChatId, messages, loading]);

    // Защита от не-массива
    const safeChats = Array.isArray(chats) ? chats : [];
    const activeChat = safeChats.find(c => c.id === activeChatId) || null;

    console.log('📊 [MainApp] Безопасные данные:', {
        safeChatsCount: safeChats.length,
        activeChat: activeChat?.title || 'нет',
        activeChatId
    });

    const handleSelect = (id) => {
        console.log(`🖱️ [MainApp] Выбран чат ${id}`);
        setActiveChatId(id);
    };
    
    const handleCreate = async () => {
        console.log('🖱️ [MainApp] Создание нового чата');
        await createChat();
    };
    
    const handleDelete = async (id) => {
        console.log(`🖱️ [MainApp] Удаление чата ${id}`);
        await deleteChat(id);
    };

    const handleSend = async (text) => {
        console.log(`💬 [MainApp] Отправка сообщения:`, text.slice(0, 50));
        if (!text.trim() || sending) return;
        await sendMessage(text);
    };

    return (
        <div style={styles.root}>
            <Sidebar
                chats={safeChats}
                activeChatId={activeChatId}
                onSelect={handleSelect}
                onCreate={handleCreate}
                onDelete={handleDelete}
            />

            <div style={styles.main}>
                <ChatHeader chat={activeChat} messagesCount={messages.length} />

                <ChatWindow
                    messages={messages}
                    loading={loading}
                    activeChatId={activeChatId}
                    onSendMessage={handleSend}
                    isStreaming={isStreaming}
                    streamingContent={streamingContent}
                />

                {activeChatId && (
                    <MessageInput
                        onSend={handleSend}
                        disabled={sending || isStreaming}
                    />
                )}
            </div>

            {/* Менеджеры */}
            <PromptManager />
        </div>
    );
}

const styles = {
    root: {
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg-base)',
    },
    main: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
    },
};