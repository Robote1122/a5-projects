/**
 * components/ChatHeader.jsx
 * Шапка активного чата с кнопкой выхода
 */

import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function ChatHeader({ chat, messagesCount }) {
    const { user, logout } = useAuth();

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
                    <div style={styles.sub}>
                        {messagesCount} сообщени
                        {messagesCount === 1 ? 'е' : messagesCount < 5 ? 'я' : 'й'}
                    </div>
                </div>
            </div>
            <div style={styles.right}>
                <span style={styles.userName}>{user?.full_name || user?.email}</span>
                <button style={styles.logoutBtn} onClick={logout} title="Выйти">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" 
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <polyline points="16 17 21 12 16 7" 
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="21" y1="12" x2="9" y2="12" 
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                </button>
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
    right: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    userName: {
        fontSize: 13,
        color: 'var(--text-secondary)',
    },
    logoutBtn: {
        color: 'var(--text-muted)',
        padding: '6px 8px',
        borderRadius: 6,
        transition: 'var(--transition)',
        ':hover': {
            color: 'var(--danger)',
            background: 'var(--bg-hover)',
        },
    },
};