/**
 * components/PromptManager.jsx
 * Менеджер для редактирования prompt-файлов
 */


import React, { useState, useEffect } from 'react';
import { promptsApi } from '../api/prompts.js';


export default function PromptManager() {
  const [promptType, setPromptType] = useState('start');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isOpen, setIsOpen] = useState(false);

  // Реф для отслеживания, был ли клик внутри модалки
  const modalRef = useRef(null);
  const isDraggingRef = useRef(false);

  const promptTypes = [
      { value: 'start', label: 'Начальный промпт' },
      { value: 'continue', label: 'Промпт с контекстом' },
  ];

  // Загрузка текущего промпта
  const loadPrompt = async (type) => {
      setLoading(true);
      setMessage({ type: '', text: '' });
      try {
          const data = await promptsApi.getPrompt(type);
          setContent(data.content);
      } catch (error) {
          setMessage({ 
              type: 'error', 
              text: error.message || 'Ошибка загрузки промпта' 
          });
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
    if (isOpen) {
      loadPrompt(promptType);
    }
  }, [promptType, isOpen]);

  // Обработчик клика по оверлею с проверкой
  const handleOverlayClick = (e) => {
      // Если клик был по оверлею (а не по модалке)
      if (modalRef.current && !modalRef.current.contains(e.target)) {
          setIsOpen(false);
      }
  };

  // Обработчик для предотвращения закрытия при выделении текста
  const handleMouseDown = (e) => {
      // Запоминаем, что начали выделение
      if (e.target.closest('.modal-content')) {
          isDraggingRef.current = false;
      }
  };

  const handleMouseUp = (e) => {
      // Если мышь отпущена вне модалки, но выделение не было начато внутри - игнорируем
      if (modalRef.current && !modalRef.current.contains(e.target)) {
          // Проверяем, было ли выделение текста
          const selection = window.getSelection();
          if (selection && selection.toString().length > 0) {
              // Если текст выделен - не закрываем
              return;
          }
      }
  };

  // Обработчик закрытия по Escape
  useEffect(() => {
      const handleEscape = (e) => {
          if (e.key === 'Escape' && isOpen) {
              setIsOpen(false);
          }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Блокировка скролла body при открытом окне
  useEffect(() => {
      if (isOpen) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = '';
      }
      return () => {
          document.body.style.overflow = '';
      };
  }, [isOpen]);

  // Сохранение через текст
  const handleSaveText = async () => {
      setSaving(true);
      setMessage({ type: '', text: '' });
      try {
          await promptsApi.updatePrompt(promptType, content);
          setMessage({ type: 'success', text: '✅ Промпт сохранен!' });
      } catch (error) {
          setMessage({ 
              type: 'error', 
              text: error.message || 'Ошибка сохранения' 
          });
      } finally {
          setSaving(false);
      }
  };

  // Загрузка файла
  const handleFileUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      if (!file.name.endsWith('.txt')) {
          setMessage({ type: 'error', text: '❌ Файл должен быть .txt' });
          return;
      }

      setSaving(true);
      setMessage({ type: '', text: '' });
      try {
          const data = await promptsApi.uploadPrompt(promptType, file);
          setMessage({ 
              type: 'success', 
              text: `✅ Файл ${data.filename || file.name} загружен!` 
          });
          await loadPrompt(promptType);
      } catch (error) {
          setMessage({ 
              type: 'error', 
              text: error.message || 'Ошибка загрузки файла' 
          });
      } finally {
          setSaving(false);
          e.target.value = '';
      }
  };

  // Восстановление из бэкапа
  const handleRestore = async () => {
      if (!confirm('Восстановить промпт из бэкапа?')) return;
      
      setSaving(true);
      setMessage({ type: '', text: '' });
      try {
          await promptsApi.restorePrompt(promptType);
          setMessage({ type: 'success', text: '✅ Промпт восстановлен из бэкапа!' });
          await loadPrompt(promptType);
      } catch (error) {
          setMessage({ 
              type: 'error', 
              text: error.message || 'Ошибка восстановления' 
          });
      } finally {
          setSaving(false);
      }
  };

  // Кнопка для открытия модалки
  const ToggleButton = () => (
    <button
      onClick={() => setIsOpen(!isOpen)}
      style={styles.toggleBtn}
      title="Управление промптами"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" 
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );

  return (
        <>
            <ToggleButton />
            
            {isOpen && (
                <div 
                    style={styles.overlay} 
                    onClick={handleOverlayClick}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                >
                    <div 
                        ref={modalRef}
                        className="modal-content"
                        style={styles.modal}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div style={styles.header}>
                            <h3 style={styles.title}>Управление промптами</h3>
                            <button 
                                style={styles.closeBtn} 
                                onClick={() => setIsOpen(false)}
                                title="Закрыть (Esc)"
                            >
                                ✕
                            </button>
                        </div>

                        <div style={styles.tabs}>
                            {promptTypes.map((type) => (
                                <button
                                    key={type.value}
                                    style={{
                                        ...styles.tab,
                                        ...(promptType === type.value ? styles.tabActive : {})
                                    }}
                                    onClick={() => setPromptType(type.value)}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>

                        <div style={styles.body}>
                            {loading ? (
                                <div style={styles.loading}>Загрузка...</div>
                            ) : (
                                <>
                                    <textarea
                                        style={styles.textarea}
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        rows={12}
                                        placeholder="Содержимое промпта..."
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onMouseUp={(e) => e.stopPropagation()}
                                    />

                                    <div style={styles.actions}>
                                        <button
                                            style={{ ...styles.btn, ...styles.btnPrimary }}
                                            onClick={handleSaveText}
                                            disabled={saving}
                                        >
                                            {saving ? 'Сохранение...' : '💾 Сохранить'}
                                        </button>

                                        <div style={styles.fileUpload}>
                                            <label style={{ ...styles.btn, ...styles.btnSecondary }}>
                                                📤 Загрузить .txt
                                                <input
                                                    type="file"
                                                    accept=".txt"
                                                    onChange={handleFileUpload}
                                                    style={styles.fileInput}
                                                />
                                            </label>
                                        </div>

                                        <button
                                            style={{ ...styles.btn, ...styles.btnDanger }}
                                            onClick={handleRestore}
                                            disabled={saving}
                                        >
                                            ↩️ Восстановить
                                        </button>
                                    </div>

                                    {message.text && (
                                        <div style={{
                                            ...styles.message,
                                            ...(message.type === 'error' ? styles.messageError : styles.messageSuccess)
                                        }}>
                                            {message.text}
                                        </div>
                                    )}

                                    <div style={styles.hint}>
                                        <small>💡 Файлы: <code>prompt_start.txt</code> и <code>prompt_continue.txt</code></small>
                                        <br />
                                        <small>📦 Бэкап создается автоматически при каждом сохранении</small>
                                        <br />
                                        <small>⌨️ Esc — закрыть окно</small>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s ease',
    },
    modal: {
        background: 'var(--bg-sidebar)',
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '700px',
        width: '95%',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.3s ease',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
    },
    title: {
        fontSize: '18px',
        fontWeight: 600,
        color: 'var(--text-primary)',
    },
    closeBtn: {
        fontSize: '20px',
        color: 'var(--text-muted)',
        padding: '4px 8px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'var(--transition)',
        ':hover': {
            background: 'var(--bg-hover)',
            color: 'var(--text-primary)',
        },
    },
    tabs: {
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
    },
    tab: {
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-muted)',
        background: 'transparent',
        border: '1px solid transparent',
        cursor: 'pointer',
        transition: 'var(--transition)',
    },
    tabActive: {
        color: 'var(--text-primary)',
        background: 'var(--bg-active)',
        borderColor: 'var(--border)',
    },
    body: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
    },
    textarea: {
        width: '100%',
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '12px',
        fontSize: '13px',
        lineHeight: '1.6',
        resize: 'vertical',
        fontFamily: 'monospace',
        minHeight: '200px',
        outline: 'none',
        transition: 'border-color var(--transition)',
        ':focus': {
            borderColor: 'var(--accent)',
        },
    },
    actions: {
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
    },
    btn: {
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        border: 'none',
        transition: 'var(--transition)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
    },
    btnPrimary: {
        background: 'var(--accent)',
        color: '#fff',
        ':hover': {
            background: 'var(--accent-hover)',
        },
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
        },
    },
    btnSecondary: {
        background: 'var(--bg-active)',
        color: 'var(--text-secondary)',
        ':hover': {
            background: 'var(--bg-hover)',
            color: 'var(--text-primary)',
        },
    },
    btnDanger: {
        background: 'var(--danger)',
        color: '#fff',
        ':hover': {
            opacity: 0.8,
        },
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
        },
    },
    fileInput: {
        display: 'none',
    },
    fileUpload: {
        display: 'inline-block',
    },
    message: {
        padding: '10px 14px',
        borderRadius: '8px',
        fontSize: '13px',
    },
    messageError: {
        background: 'rgba(239,68,68,0.15)',
        color: '#ef4444',
        border: '1px solid rgba(239,68,68,0.3)',
    },
    messageSuccess: {
        background: 'rgba(34,197,94,0.15)',
        color: '#22c55e',
        border: '1px solid rgba(34,197,94,0.3)',
    },
    loading: {
        textAlign: 'center',
        padding: '40px',
        color: 'var(--text-muted)',
    },
    hint: {
        padding: '10px 0',
        fontSize: '12px',
        color: 'var(--text-muted)',
        lineHeight: '1.8',
        '& code': {
            background: 'var(--bg-input)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'monospace',
        },
    },
    toggleBtn: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        background: 'var(--bg-active)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        cursor: 'pointer',
        transition: 'var(--transition)',
        ':hover': {
            background: 'var(--bg-hover)',
            color: 'var(--text-primary)',
        },
    },
};

// Добавляем CSS анимации в глобальный стиль
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @keyframes slideUp {
        from { 
            opacity: 0;
            transform: translateY(20px) scale(0.95);
        }
        to { 
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
`;
document.head.appendChild(styleSheet);