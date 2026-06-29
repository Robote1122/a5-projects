/**
 * components/MessageInput.jsx
 * Нижняя панель ввода сообщений. Enter — отправить, Shift+Enter — перенос строки.
 */

import React, { useState, useRef, useEffect } from 'react';

export default function MessageInput({ onSend, disabled }) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  // Авторастягивающийся textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [value]);

  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div style={styles.wrapper}>
      <div style={styles.inputBox}>
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Введи сообщение… (Enter — отправить)"
          rows={1}
          disabled={disabled}
        />
        <button
          style={{ ...styles.sendBtn, ...(canSend ? styles.sendBtnActive : {}) }}
          onClick={handleSend}
          disabled={!canSend}
          title="Отправить (Enter)"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      <p style={styles.hint}>Enter — отправить · Shift+Enter — перенос</p>
    </div>
  );
}

const styles = {
  wrapper: {
    padding: '12px 20px 16px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-chat)',
  },
  inputBox: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    background: 'var(--bg-input)',
    borderRadius: 14,
    padding: '8px 12px',
    border: '1px solid var(--border)',
    transition: 'border-color var(--transition)',
  },
  textarea: {
    flex: 1,
    resize: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 14,
    lineHeight: 1.6,
    maxHeight: 180,
    minHeight: 24,
    overflowY: 'auto',
    padding: '2px 0',
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-active)',
    color: 'var(--text-muted)',
    flexShrink: 0,
    marginBottom: 1,
    transition: 'background var(--transition), color var(--transition)',
  },
  sendBtnActive: {
    background: 'var(--accent)',
    color: '#fff',
  },
  hint: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 6,
    paddingLeft: 2,
    opacity: 0.6,
  },
};
