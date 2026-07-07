// client/src/components/PromptManager.jsx
import React, { useState, useEffect, useRef } from 'react';
import { promptsApi } from '../api/prompts.js';
import { documentsApi } from '../api/documents.js';
import { useAuth } from '../context/AuthContext';

const MAX_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export default function PromptManager() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';
    
    // Состояние для вкладок
    const [activeTab, setActiveTab] = useState('prompts');
    
    // Состояние для промптов
    const [promptType, setPromptType] = useState('start');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isOpen, setIsOpen] = useState(false);
    
    // Состояние для документов
    const [documents, setDocuments] = useState([]);
    const [docsLoading, setDocsLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [customNames, setCustomNames] = useState({});
    const [docError, setDocError] = useState(null);
    const [docSuccess, setDocSuccess] = useState(null);
    
    const fileInputRef = useRef(null);
    const dragCounterRef = useRef(0);
    const modalRef = useRef(null);
    const isDraggingRef = useRef(false);

    // Все доступные промпты
    const promptTypes = [
        { value: 'start', label: 'Начальный промпт (без контекста)' },
        { value: 'continue', label: 'Промпт с контекстом' },
        { value: 'structure', label: 'Промпт структурирования' },
        { value: 'ocr', label: 'OCR промпт' },
    ];

    // Загрузка промпта
    const loadPrompt = async (type) => {
        setLoading(true);
        setMessage({ type: '', text: '' });
        try {
            const data = await promptsApi.getPrompt(type);
            setContent(data.content || '');
        } catch (error) {
            setMessage({ 
                type: 'error', 
                text: error.message || 'Ошибка загрузки промпта' 
            });
        } finally {
            setLoading(false);
        }
    };

    // Загрузка документов
    const loadDocuments = async () => {
        if (!isAdmin) return;
        setDocsLoading(true);
        setDocError(null);
        try {
            const response = await documentsApi.getDocuments();
            if (response.success) {
                setDocuments(response.data || []);
            } else {
                setDocError(response.error || 'Ошибка загрузки списка документов');
            }
        } catch (err) {
            setDocError(err.message || 'Ошибка загрузки документов');
        } finally {
            setDocsLoading(false);
        }
    };

    // Загрузка при открытии
    useEffect(() => {
        if (isOpen) {
            loadPrompt(promptType);
            if (isAdmin) {
                loadDocuments();
            }
        }
    }, [isOpen, promptType, isAdmin]);

    // Polling для обновления статусов документов
    useEffect(() => {
        let interval = null;
        if (isOpen && isAdmin && activeTab === 'documents') {
            interval = setInterval(loadDocuments, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isOpen, isAdmin, activeTab]);

    // Обработка выбора файлов
    const handleFileSelect = (files) => {
        const validFiles = [];
        const errors = [];
        
        if (selectedFiles.length + files.length > MAX_FILES) {
            errors.push(`Максимум ${MAX_FILES} файлов за раз`);
        }
        
        for (const file of files) {
            if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
                errors.push(`"${file.name}" - только PDF файлы`);
                continue;
            }
            if (file.size > MAX_FILE_SIZE) {
                errors.push(`"${file.name}" - превышает ${MAX_FILE_SIZE / 1024 / 1024}MB`);
                continue;
            }
            if (selectedFiles.some(f => f.name === file.name)) {
                errors.push(`"${file.name}" - уже выбран`);
                continue;
            }
            validFiles.push(file);
        }
        
        if (errors.length > 0) {
            setDocError(errors.join('\n'));
            setTimeout(() => setDocError(null), 5000);
        }
        
        if (validFiles.length > 0) {
            setSelectedFiles([...selectedFiles, ...validFiles]);
            const newNames = {};
            validFiles.forEach(file => {
                const baseName = file.name.replace(/\.[^/.]+$/, '');
                newNames[file.name] = baseName;
            });
            setCustomNames({ ...customNames, ...newNames });
        }
    };

    // Drag & Drop
    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current -= 1;
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files);
        }
    };

    // Загрузка файлов
    const handleUpload = async () => {
        if (selectedFiles.length === 0) {
            setDocError('Выберите файлы для загрузки');
            return;
        }

        setUploading(true);
        setDocError(null);
        setDocSuccess(null);

        try {
            const response = await documentsApi.uploadFiles(selectedFiles, customNames);
            if (response.success) {
                setDocSuccess(`Загружено ${response.data.summary.success} файлов`);
                if (response.data.summary.errors > 0) {
                    setDocError(`${response.data.summary.errors} файлов с ошибкой`);
                }
                setSelectedFiles([]);
                setCustomNames({});
                await loadDocuments();
            } else {
                setDocError(response.error || 'Ошибка загрузки');
            }
        } catch (err) {
            setDocError(err.message || 'Ошибка загрузки документов');
        } finally {
            setUploading(false);
        }
    };

    // Удаление файла из списка
    const removeSelectedFile = (fileName) => {
        setSelectedFiles(selectedFiles.filter(f => f.name !== fileName));
        const newNames = { ...customNames };
        delete newNames[fileName];
        setCustomNames(newNames);
    };

    // Обновление имени файла
    const updateFileName = (fileName, newName) => {
        setCustomNames({ ...customNames, [fileName]: newName });
    };

    // Удаление документа
    const handleDelete = async (docId, docName) => {
        if (!confirm(`Удалить документ "${docName}"?`)) return;
        try {
            const response = await documentsApi.deleteDocument(docId);
            if (response.success) {
                setDocSuccess(`Документ "${docName}" удалён`);
                await loadDocuments();
            } else {
                setDocError(response.error || 'Ошибка удаления');
            }
        } catch (err) {
            setDocError(err.message || 'Ошибка удаления');
        }
    };

    // Повторная обработка
    const handleReprocess = async (docId, docName) => {
        try {
            const response = await documentsApi.reprocessDocument(docId);
            if (response.success) {
                setDocSuccess(`Документ "${docName}" отправлен на повторную обработку`);
                await loadDocuments();
            } else {
                setDocError(response.error || 'Ошибка повторной обработки');
            }
        } catch (err) {
            setDocError(err.message || 'Ошибка повторной обработки');
        }
    };

    // Сохранение промпта
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

    // Загрузка файла промпта
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
            await promptsApi.uploadPrompt(promptType, file);
            setMessage({ type: 'success', text: `✅ Файл ${file.name} загружен!` });
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

    // Форматирование размера
    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    };

    // Форматирование даты
    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Статус документа
    const getStatusInfo = (status) => {
        const map = {
            pending: { label: '⏳ Ожидает', color: 'var(--text-muted)' },
            processing: { label: '🔄 Обработка...', color: '#f59e0b' },
            completed: { label: '✅ Готово', color: '#22c55e' },
            error: { label: '❌ Ошибка', color: '#ef4444' },
            deleted: { label: '🗑️ Удалён', color: 'var(--text-muted)' },
        };
        return map[status] || { label: status, color: 'var(--text-muted)' };
    };

    // Закрытие
    const handleClose = () => {
        setIsOpen(false);
        setSelectedFiles([]);
        setCustomNames({});
        setDocError(null);
        setDocSuccess(null);
        setMessage({ type: '', text: '' });
    };

    // Кнопка открытия
    const ToggleButton = () => (
        <button
            onClick={() => setIsOpen(!isOpen)}
            style={styles.toggleBtn}
            title="Управление"
        >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" 
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
        </button>
    );

    // Не админ — показываем только промпты
    if (!isAdmin) {
        return (
            <>
                <ToggleButton />
                {isOpen && (
                    <div style={styles.overlay} onClick={handleClose}>
                        <div ref={modalRef} style={styles.modal} onClick={(e) => e.stopPropagation()}>
                            <div style={styles.header}>
                                <h3 style={styles.title}>Управление промптами</h3>
                                <button style={styles.closeBtn} onClick={handleClose}>✕</button>
                            </div>
                            {renderPromptsTab()}
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <>
            <ToggleButton />
            
            {isOpen && (
                <div style={styles.overlay} onClick={handleClose}>
                    <div ref={modalRef} style={styles.modal} onClick={(e) => e.stopPropagation()}>
                        {/* Заголовок */}
                        <div style={styles.header}>
                            <h3 style={styles.title}>Управление системой</h3>
                            <button style={styles.closeBtn} onClick={handleClose}>✕</button>
                        </div>

                        {/* Вкладки */}
                        <div style={styles.tabsContainer}>
                            <button
                                style={{ ...styles.tabButton, ...(activeTab === 'prompts' ? styles.tabButtonActive : {}) }}
                                onClick={() => setActiveTab('prompts')}
                            >
                                📝 Промпты
                            </button>
                            <button
                                style={{ ...styles.tabButton, ...(activeTab === 'documents' ? styles.tabButtonActive : {}) }}
                                onClick={() => setActiveTab('documents')}
                            >
                                📚 Документы ({documents.filter(d => d.status !== 'deleted').length})
                            </button>
                        </div>

                        {/* Контент вкладок */}
                        <div style={styles.tabContent}>
                            {activeTab === 'prompts' && renderPromptsTab()}
                            {activeTab === 'documents' && renderDocumentsTab()}
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    // ===== ВКЛАДКА ПРОМПТОВ =====
    function renderPromptsTab() {
        return (
            <div>
                <div style={styles.promptTypes}>
                    {promptTypes.map((type) => (
                        <button
                            key={type.value}
                            style={{
                                ...styles.promptTypeBtn,
                                ...(promptType === type.value ? styles.promptTypeBtnActive : {})
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
                                <small>💡 Файлы: <code>prompt_start.txt</code>, <code>prompt_continue.txt</code>, <code>structure_prompt.txt</code>, <code>ocr_prompt.txt</code></small>
                                <br />
                                <small>📦 Бэкап создается автоматически при каждом сохранении</small>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ===== ВКЛАДКА ДОКУМЕНТОВ =====
    function renderDocumentsTab() {
        return (
            <div>
                {/* Сообщения */}
                {docError && (
                    <div style={{ ...styles.message, ...styles.messageError }}>
                        {docError}
                        <button style={styles.messageClose} onClick={() => setDocError(null)}>✕</button>
                    </div>
                )}
                {docSuccess && (
                    <div style={{ ...styles.message, ...styles.messageSuccess }}>
                        {docSuccess}
                        <button style={styles.messageClose} onClick={() => setDocSuccess(null)}>✕</button>
                    </div>
                )}

                {/* Зона загрузки */}
                <div
                    style={styles.dropZone}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <div style={styles.dropIcon}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" 
                                stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
                            <polyline points="17 8 12 3 7 8" 
                                stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="12" y1="3" x2="12" y2="15" 
                                stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </div>
                    <p style={styles.dropText}>
                        Перетащите PDF файлы сюда или <span style={styles.dropLink}>выберите файлы</span>
                    </p>
                    <p style={styles.dropHint}>
                        Поддерживается до {MAX_FILES} файлов, максимум {MAX_FILE_SIZE / 1024 / 1024}MB каждый
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        multiple
                        style={styles.dropInput}
                        onChange={(e) => {
                            if (e.target.files.length > 0) {
                                handleFileSelect(e.target.files);
                            }
                            e.target.value = '';
                        }}
                    />
                </div>

                {/* Список выбранных файлов */}
                {selectedFiles.length > 0 && (
                    <div style={styles.selectedFiles}>
                        <div style={styles.selectedHeader}>
                            <span>Выбрано файлов: {selectedFiles.length}</span>
                            <button
                                style={styles.clearBtn}
                                onClick={() => {
                                    setSelectedFiles([]);
                                    setCustomNames({});
                                }}
                            >
                                Очистить
                            </button>
                        </div>
                        {selectedFiles.map((file) => (
                            <div key={file.name} style={styles.selectedFile}>
                                <span style={styles.fileIcon}>📄</span>
                                <input
                                    style={styles.fileNameInput}
                                    value={customNames[file.name] || file.name}
                                    onChange={(e) => updateFileName(file.name, e.target.value)}
                                    placeholder="Введите название документа"
                                />
                                <span style={styles.fileSize}>{formatFileSize(file.size)}</span>
                                <button
                                    style={styles.removeFileBtn}
                                    onClick={() => removeSelectedFile(file.name)}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                        <button
                            style={styles.uploadBtn}
                            onClick={handleUpload}
                            disabled={uploading || selectedFiles.length === 0}
                        >
                            {uploading ? '⏳ Загрузка...' : '🚀 Загрузить файлы'}
                        </button>
                    </div>
                )}

                {/* Список документов */}
                <div style={styles.documentsList}>
                    <div style={styles.listHeader}>
                        <span>Загруженные документы</span>
                        <span style={styles.docCount}>
                            {documents.filter(d => d.status !== 'deleted').length}
                        </span>
                    </div>

                    {docsLoading ? (
                        <div style={styles.loading}>Загрузка...</div>
                    ) : documents.filter(d => d.status !== 'deleted').length === 0 ? (
                        <div style={styles.empty}>Нет загруженных документов</div>
                    ) : (
                        documents.filter(d => d.status !== 'deleted').map((doc) => {
                            const statusInfo = getStatusInfo(doc.status);
                            return (
                                <div key={doc.id} style={styles.docItem}>
                                    <div style={styles.docInfo}>
                                        <span style={styles.docName}>{doc.custom_name}</span>
                                        <span style={styles.docOriginal}>{doc.original_name}</span>
                                        <span style={{ ...styles.docStatus, color: statusInfo.color }}>
                                            {statusInfo.label}
                                        </span>
                                    </div>
                                    <div style={styles.docMeta}>
                                        <span style={styles.docDate}>{formatDate(doc.created_at)}</span>
                                        {doc.chunk_count > 0 && (
                                            <span style={styles.docChunks}>{doc.chunk_count} чанков</span>
                                        )}
                                        {doc.page_count > 0 && (
                                            <span style={styles.docPages}>{doc.page_count} стр.</span>
                                        )}
                                    </div>
                                    <div style={styles.docActions}>
                                        {doc.status === 'error' && (
                                            <button
                                                style={styles.reprocessBtn}
                                                onClick={() => handleReprocess(doc.id, doc.custom_name)}
                                                title="Повторить обработку"
                                            >
                                                🔄
                                            </button>
                                        )}
                                        <button
                                            style={styles.deleteDocBtn}
                                            onClick={() => handleDelete(doc.id, doc.custom_name)}
                                            title="Удалить документ"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    }
}

// ===== СТИЛИ =====
const styles = {
    // Кнопка открытия
    toggleBtn: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '48px',
        height: '48px',
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
    
    // Оверлей и модалка
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
    },
    modal: {
        background: 'var(--bg-sidebar)',
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '1000px',
        width: '95%',
        maxHeight: '92vh',
        overflow: 'auto',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
    },
    title: {
        fontSize: '20px',
        fontWeight: 600,
        color: 'var(--text-primary)',
    },
    closeBtn: {
        fontSize: '22px',
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

    // Вкладки
    tabsContainer: {
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '4px',
    },
    tabButton: {
        padding: '10px 20px',
        borderRadius: '8px 8px 0 0',
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'var(--transition)',
        border: '1px solid transparent',
        borderBottom: 'none',
    },
    tabButtonActive: {
        color: 'var(--text-primary)',
        background: 'var(--bg-input)',
        borderColor: 'var(--border)',
    },
    tabContent: {
        paddingTop: '4px',
    },

    // Промпты
    promptTypes: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        marginBottom: '12px',
    },
    promptTypeBtn: {
        padding: '6px 14px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--text-muted)',
        background: 'transparent',
        border: '1px solid transparent',
        cursor: 'pointer',
        transition: 'var(--transition)',
    },
    promptTypeBtnActive: {
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
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
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
    messageClose: {
        background: 'none',
        border: 'none',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: '16px',
        padding: '0 4px',
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

    // Документы
    dropZone: {
        border: '2px dashed var(--border)',
        borderRadius: '12px',
        padding: '30px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'var(--transition)',
        marginBottom: '16px',
        ':hover': {
            borderColor: 'var(--accent)',
            background: 'rgba(59,130,246,0.05)',
        },
    },
    dropIcon: {
        marginBottom: '8px',
    },
    dropText: {
        fontSize: '15px',
        color: 'var(--text-secondary)',
        marginBottom: '4px',
    },
    dropLink: {
        color: 'var(--accent)',
        cursor: 'pointer',
        textDecoration: 'underline',
    },
    dropHint: {
        fontSize: '12px',
        color: 'var(--text-muted)',
    },
    dropInput: {
        display: 'none',
    },
    selectedFiles: {
        marginBottom: '16px',
        padding: '12px',
        background: 'var(--bg-input)',
        borderRadius: '8px',
    },
    selectedHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
        fontSize: '13px',
        color: 'var(--text-secondary)',
    },
    clearBtn: {
        color: 'var(--danger)',
        fontSize: '12px',
        cursor: 'pointer',
        ':hover': {
            opacity: 0.7,
        },
    },
    selectedFile: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        background: 'var(--bg-sidebar)',
        borderRadius: '6px',
        marginBottom: '4px',
    },
    fileIcon: {
        fontSize: '14px',
    },
    fileNameInput: {
        flex: 1,
        background: 'transparent',
        color: 'var(--text-primary)',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid transparent',
        fontSize: '13px',
        ':focus': {
            borderColor: 'var(--accent)',
        },
    },
    fileSize: {
        fontSize: '11px',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
    },
    removeFileBtn: {
        color: 'var(--danger)',
        cursor: 'pointer',
        padding: '0 4px',
        fontSize: '14px',
        ':hover': {
            opacity: 0.7,
        },
    },
    uploadBtn: {
        width: '100%',
        padding: '10px',
        background: 'var(--accent)',
        color: '#fff',
        borderRadius: '8px',
        fontSize: '15px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'var(--transition)',
        marginTop: '8px',
        ':hover': {
            background: 'var(--accent-hover)',
        },
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
        },
    },
    documentsList: {
        maxHeight: '300px',
        overflow: 'auto',
    },
    listHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 4px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '8px',
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-secondary)',
    },
    docCount: {
        background: 'var(--bg-input)',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '11px',
    },
    empty: {
        textAlign: 'center',
        padding: '20px',
        color: 'var(--text-muted)',
        fontSize: '13px',
    },
    docItem: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        borderBottom: '1px solid var(--border)',
        gap: '8px',
        ':hover': {
            background: 'var(--bg-hover)',
        },
    },
    docInfo: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    docName: {
        fontWeight: 500,
        fontSize: '13px',
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '180px',
    },
    docOriginal: {
        fontSize: '11px',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '120px',
    },
    docStatus: {
        fontSize: '11px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
    },
    docMeta: {
        display: 'flex',
        gap: '10px',
        fontSize: '11px',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
    },
    docChunks: {},
    docPages: {},
    docDate: {},
    docActions: {
        display: 'flex',
        gap: '4px',
    },
    reprocessBtn: {
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        cursor: 'pointer',
        background: 'var(--bg-input)',
        color: 'var(--text-secondary)',
        ':hover': {
            background: 'var(--bg-hover)',
        },
    },
    deleteDocBtn: {
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        cursor: 'pointer',
        background: 'var(--bg-input)',
        color: 'var(--danger)',
        ':hover': {
            background: 'rgba(239,68,68,0.1)',
        },
    },
};