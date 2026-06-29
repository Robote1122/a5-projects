/**
 * components/Sidebar.jsx
 * Левая панель: список чатов, кнопка нового чата, удаление.
 */

import React, { useState } from 'react';

function formatDate(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)       return 'только что';
  if (diff < 3600)     return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)} ч`;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

export default function Sidebar({ chats, activeChatId, onSelect, onCreate, onDelete }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = chats.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside style={styles.sidebar}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={styles.logoText}>Вzmakh Chat</span>
        </div>
        <button style={styles.newBtn} onClick={onCreate} title="Новый чат">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Search */}
      <div style={styles.searchWrap}>
        <svg style={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="#64748b" strokeWidth="2"/>
          <path d="M21 21l-4.35-4.35" stroke="#64748b" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input
          style={styles.search}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск чатов…"
        />
      </div>

      {/* List */}
      <div style={styles.list}>
        {filtered.length === 0 && (
          <div style={styles.empty}>
            {search ? 'Ничего не найдено' : 'Нет чатов. Создай первый!'}
          </div>
        )}
        {filtered.map(chat => (
          <div
            key={chat.id}
            style={{
              ...styles.item,
              ...(activeChatId === chat.id ? styles.itemActive : {}),
              ...(hoveredId === chat.id && activeChatId !== chat.id ? styles.itemHover : {}),
            }}
            onClick={() => onSelect(chat.id)}
            onMouseEnter={() => setHoveredId(chat.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div style={styles.itemBody}>
              <div style={styles.itemTitle}>{chat.title}</div>
              {chat.last_message && (
                <div style={styles.itemPreview}>
                  {chat.last_message.slice(0, 55)}{chat.last_message.length > 55 ? '…' : ''}
                </div>
              )}
            </div>
            <div style={styles.itemRight}>
              <span style={styles.itemTime}>{formatDate(chat.updated_at)}</span>
              {hoveredId === chat.id && (
                <button
                  style={styles.deleteBtn}
                  onClick={e => { e.stopPropagation(); onDelete(chat.id); }}
                  title="Удалить чат"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.footerText}>{chats.length} чат{chats.length !== 1 ? 'ов' : ''}</span>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 280,
    minWidth: 240,
    maxWidth: 320,
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 16px 14px',
    borderBottom: '1px solid var(--border)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontWeight: 600,
    fontSize: 15,
    color: 'var(--text-primary)',
    letterSpacing: '-0.2px',
  },
  newBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    transition: 'var(--transition)',
  },
  searchWrap: {
    position: 'relative',
    margin: '10px 12px 4px',
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
  },
  search: {
    width: '100%',
    background: 'var(--bg-input)',
    borderRadius: 8,
    padding: '8px 10px 8px 32px',
    fontSize: 13,
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 6px',
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: 13,
    textAlign: 'center',
    padding: '40px 16px',
    lineHeight: 1.5,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 10px',
    borderRadius: 10,
    cursor: 'pointer',
    marginBottom: 2,
    transition: 'background var(--transition)',
  },
  itemActive: {
    background: 'var(--bg-active)',
  },
  itemHover: {
    background: 'var(--bg-hover)',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    fontWeight: 500,
    fontSize: 13,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: 2,
  },
  itemPreview: {
    fontSize: 12,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  itemTime: {
    fontSize: 11,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  deleteBtn: {
    color: 'var(--danger)',
    opacity: 0.8,
    padding: 2,
    borderRadius: 4,
  },
  footer: {
    padding: '10px 16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
};
