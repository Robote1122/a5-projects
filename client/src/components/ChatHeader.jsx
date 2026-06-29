/**
 * components/ChatHeader.jsx
 * Шапка активного чата с заголовком и счётчиком сообщений.
 */

import React from 'react';

export default function ChatHeader({ chat, messagesCount }) {
  if (!chat) return null;

  return (
    <div style={styles.header}>
      <div style={styles.info}>
        <div style={styles.icon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div style={styles.title}>{chat.title}</div>
          <div style={styles.sub}>{messagesCount} сообщени{messagesCount === 1 ? 'е' : messagesCount < 5 ? 'я' : 'й'}</div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: {
    padding: '14px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-chat)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  info: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: 'var(--bg-input)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--text-primary)',
    maxWidth: 480,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 1,
  },
};
