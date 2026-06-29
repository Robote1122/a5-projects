/**
 * App.jsx
 * Корневой компонент. Собирает Sidebar + ChatHeader + ChatWindow + MessageInput.
 */

import React from 'react';
import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import ChatWindow from './components/ChatWindow';
import MessageInput from './components/MessageInput';
import { useChats } from './hooks/useChats';

export default function App() {
  const {
    chats,
    activeChatId,
    setActiveChatId,
    messages,
    loading,
    sending,
    createChat,
    deleteChat,
    sendMessage,
  } = useChats();

  const activeChat = chats.find(c => c.id === activeChatId) || null;

  const handleSelect = (id) => setActiveChatId(id);
  const handleCreate = async () => await createChat();
  const handleDelete = async (id) => await deleteChat(id);
  const handleSend   = async (text) => await sendMessage(text);

  return (
    <div style={styles.root}>
      <Sidebar
        chats={chats}
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
        />
        {activeChatId && (
          <MessageInput onSend={handleSend} disabled={sending} />
        )}
      </div>
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
