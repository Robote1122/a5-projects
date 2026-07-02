/**
 * components/ChatWindow.jsx
 * Центральная область: сообщения чата с поддержкой стриминга
 */

import React, { useEffect, useRef, useState } from 'react';

// Компонент аватара
function Avatar({ role }) {
  if (role === 'user') {
    return (
      <div style={{ ...styles.avatar, background: '#2563eb' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="#fff" strokeWidth="2"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }
  return (
    <div style={{ ...styles.avatar, background: 'var(--bg-active)' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#3b82f6" strokeWidth="2"/>
        <path d="M9 12l2 2 4-4" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// Компонент обычного сообщения
function Message({ msg }) {
  const isUser = msg.role === 'user';
  const time = new Date(msg.created_at * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div style={{ ...styles.msgRow, ...(isUser ? styles.msgRowUser : {}) }}>
      {!isUser && <Avatar role={msg.role} />}
      <div style={styles.msgGroup}>
        <div style={{
          ...styles.bubble,
          ...(isUser ? styles.bubbleUser : styles.bubbleAI),
        }}>
          <p style={styles.msgText}>{msg.content}</p>
        </div>
        <span style={{ ...styles.msgTime, ...(isUser ? { textAlign: 'right' } : {}) }}>
          {time}
        </span>
      </div>
      {isUser && <Avatar role="user" />}
    </div>
  );
}

// Компонент стримингового сообщения (печатает...)
function StreamingMessage({ content }) {
  return (
    <div style={styles.msgRow}>
      <Avatar role="assistant" />
      <div style={styles.msgGroup}>
        <div style={{ ...styles.bubble, ...styles.bubbleAI }}>
          <p style={styles.msgText}>
            {content}
            <span style={styles.cursorBlink}>▊</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// Основной компонент
export default function ChatWindow({ 
  messages, 
  loading, 
  activeChatId, 
  onSendMessage,
  isStreaming,
  streamingContent 
}) {
  const bottomRef = useRef(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  // Автоскролл к новым сообщениям
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  // Показывать подсказку о прокрутке, если сообщений много
  useEffect(() => {
    const container = document.querySelector('.chat-messages-container');
    if (container) {
      const isScrolledUp = container.scrollTop < container.scrollHeight - container.clientHeight - 100;
      setShowScrollHint(isScrolledUp);
    }
  }, [messages]);

  if (!activeChatId) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={styles.emptyTitle}>Выбери чат или создай новый</p>
        <p style={styles.emptyHint}>Все сообщения хранятся локально в SQLite</p>
        <p style={styles.emptyHint}>🤖 AI ассистент использует RAG на базе GigaChat</p>
      </div>
    );
  }

  return (
    <div style={styles.window}>
      {loading && messages.length === 0 ? (
        <div style={styles.loadingWrap}>
          <span style={styles.loadingDot} />
          <span style={{ ...styles.loadingDot, animationDelay: '0.2s' }} />
          <span style={{ ...styles.loadingDot, animationDelay: '0.4s' }} />
        </div>
      ) : (
        <div style={styles.msgList} className="chat-messages-container">
          {messages.length === 0 && (
            <div style={styles.startHint}>
              💬 Начни переписку — введи сообщение
              <br />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                AI будет отвечать с использованием базы знаний по безопасности
              </span>
            </div>
          )}
          
          {messages.map((msg) => (
            <Message key={msg.id} msg={msg} />
          ))}
          
          {/* Стриминговое сообщение (печатает...) */}
          {isStreaming && (
            <StreamingMessage content={streamingContent} />
          )}
          
          <div ref={bottomRef} />
        </div>
      )}

      {/* Подсказка прокрутки вниз */}
      {showScrollHint && (
        <button 
          style={styles.scrollHint}
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
        >
          ↓ Новые сообщения
        </button>
      )}

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// Стили (CSS-in-JS)
const styles = {
  window: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg-chat)',
    position: 'relative',
  },
  msgList: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    scrollBehavior: 'smooth',
  },
  msgRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    maxWidth: '80%',
  },
  msgRowUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
  },
  msgGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxWidth: '100%',
  },
  bubble: {
    padding: '10px 14px',
    borderRadius: 14,
    maxWidth: 520,
    wordBreak: 'break-word',
  },
  bubbleUser: {
    background: 'var(--bg-msg-user)',
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    background: 'var(--bg-msg-ai)',
    borderBottomLeftRadius: 4,
    border: '1px solid var(--border)',
  },
  msgText: {
    fontSize: 14,
    lineHeight: 1.65,
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
    margin: 0,
  },
  msgTime: {
    fontSize: 11,
    color: 'var(--text-muted)',
    paddingLeft: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cursorBlink: {
    animation: 'blink 1s infinite',
    color: 'var(--accent)',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--text-muted)',
    padding: 40,
  },
  emptyIcon: {
    marginBottom: 8,
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  emptyHint: {
    fontSize: 13,
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  loadingWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--accent)',
    display: 'inline-block',
    animation: 'pulse 1.2s infinite ease-in-out',
  },
  startHint: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 13,
    padding: '60px 0',
    lineHeight: 2,
  },
  scrollHint: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 16px',
    background: 'var(--bg-active)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    color: 'var(--text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'var(--transition)',
    zIndex: 10,
  },
};