// client/src/components/DocumentManager.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { documentsApi } from '../api/documents';
import { useAuth } from '../context/AuthContext';

const MAX_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export default function DocumentManager() {
    const { user } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [customNames, setCustomNames] = useState({});
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [pollingInterval, setPollingInterval] = useState(null);
    
    const fileInputRef = useRef(null);
    const dragCounterRef = useRef(0);

    // Проверяем, админ ли пользователь
    const isAdmin = user?.role === 'ADMIN';

    // Загрузка списка документов
    const loadDocuments = useCallback(async () => {
        if (!isAdmin) return;
        
        setLoading(true);
        setError(null);
        try {
            const response = await documentsApi.getDocuments();
            if (response.success) {
                setDocuments(response.data || []);
            } else {
                setError(response.error || 'Ошибка загрузки списка документов');
            }
        } catch (err) {
            setError(err.message || 'Ошибка загрузки документов');
            console.error('Load documents error:', err);
        } finally {
            setLoading(false);
        }
    }, [isAdmin]);

    // Загрузка при открытии и периодическое обновление
    useEffect(() => {
        if (isOpen && isAdmin) {
            loadDocuments();
            
            // Начинаем polling для обновления статусов
            const interval = setInterval(() => {
                loadDocuments();
            }, 5000); // Каждые 5 секунд
            
            setPollingInterval(interval);
            
            return () => {
                clearInterval(interval);
                setPollingInterval(null);
            };
        }
    }, [isOpen, isAdmin, loadDocuments]);

    // Обработка выбора файлов
    const handleFileSelect = (files) => {
        const validFiles = [];
        const errors = [];
        
        // Проверяем количество
        if (selectedFiles.length + files.length > MAX_FILES) {
            errors.push(`Максимум ${MAX_FILES} файлов за раз`);
        }
        
        // Проверяем каждый файл
        for (const file of files) {
            // Проверяем тип
            if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
                errors.push(`"${file.name}" - только PDF файлы`);
                continue;
            }
            
            // Проверяем размер
            if (file.size > MAX_FILE_SIZE) {
                errors.push(`"${file.name}" - превышает ${MAX_FILE_SIZE / 1024 / 1024}MB`);
                continue;
            }
            
            // Проверяем на дубликаты по имени
            if (selectedFiles.some(f => f.name === file.name)) {
                errors.push(`"${file.name}" - уже выбран`);
                continue;
            }
            
            validFiles.push(file);
        }
        
        if (errors.length > 0) {
            setError(errors.join('\n'));
            setTimeout(() => setError(null), 5000);
        }
        
        if (validFiles.length > 0) {
            setSelectedFiles([...selectedFiles, ...validFiles]);
            
            // Добавляем имена по умолчанию
            const newNames = {};
            validFiles.forEach(file => {
                const baseName = file.name.replace(/\.[^/.]+$/, '');
                newNames[file.name] = baseName;
            });
            setCustomNames({ ...customNames, ...newNames });
        }
    };

    // Drag & Drop обработчики
    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current === 0) {
            // Можно показать, что дроп-зона не активна
        }
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

    // Загрузка на сервер
    const handleUpload = async () => {
        if (selectedFiles.length === 0) {
            setError('Выберите файлы для загрузки');
            return;
        }

        setUploading(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await documentsApi.uploadFiles(selectedFiles, customNames);
            
            if (response.success) {
                setSuccess(`Загружено ${response.data.summary.success} файлов`);
                if (response.data.summary.errors > 0) {
                    setError(`${response.data.summary.errors} файлов с ошибкой`);
                }
                
                // Очищаем выбранные файлы
                setSelectedFiles([]);
                setCustomNames({});
                
                // Обновляем список
                await loadDocuments();
            } else {
                setError(response.error || 'Ошибка загрузки');
            }
        } catch (err) {
            setError(err.message || 'Ошибка загрузки документов');
            console.error('Upload error:', err);
        } finally {
            setUploading(false);
        }
    };

    // Удаление файла из списка выбранных
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
                setSuccess(`Документ "${docName}" удалён`);
                await loadDocuments();
            } else {
                setError(response.error || 'Ошибка удаления');
            }
        } catch (err) {
            setError(err.message || 'Ошибка удаления');
            console.error('Delete error:', err);
        }
    };

    // Повторная обработка
    const handleReprocess = async (docId, docName) => {
        try {
            const response = await documentsApi.reprocessDocument(docId);
            if (response.success) {
                setSuccess(`Документ "${docName}" отправлен на повторную обработку`);
                await loadDocuments();
            } else {
                setError(response.error || 'Ошибка повторной обработки');
            }
        } catch (err) {
            setError(err.message || 'Ошибка повторной обработки');
            console.error('Reprocess error:', err);
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

    // Получение статуса с цветом
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

    // Если не админ, показываем сообщение
    if (!isAdmin) {
        return (
            <div style={styles.accessDenied}>
                <p>⛔ Доступ только для администраторов</p>
            </div>
        );
    }

    return (
        <>
            {/* Кнопка открытия */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={styles.toggleBtn}
                title="Управление документами"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" 
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="13 2 13 9 20 9" 
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={styles.badge}>
                    {documents.filter(d => d.status === 'completed').length}
                </span>
            </button>

            {/* Модальное окно */}
            {isOpen && (
                <div style={styles.overlay} onClick={() => setIsOpen(false)}>
                    <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.header}>
                            <h3 style={styles.title}>📚 Управление базой знаний</h3>
                            <button
                                style={styles.closeBtn}
                                onClick={() => setIsOpen(false)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Сообщения */}
                        {error && (
                            <div style={{ ...styles.message, ...styles.messageError }}>
                                {error}
                                <button 
                                    style={styles.messageClose}
                                    onClick={() => setError(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                        {success && (
                            <div style={{ ...styles.message, ...styles.messageSuccess }}>
                                {success}
                                <button
                                    style={styles.messageClose}
                                    onClick={() => setSuccess(null)}
                                >
                                    ✕
                                </button>
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

                            {loading ? (
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
                                                <span style={styles.docOriginal}>
                                                    {doc.original_name}
                                                </span>
                                                <span style={{ ...styles.docStatus, color: statusInfo.color }}>
                                                    {statusInfo.label}
                                                </span>
                                            </div>
                                            <div style={styles.docMeta}>
                                                <span style={styles.docDate}>
                                                    {formatDate(doc.created_at)}
                                                </span>
                                                {doc.chunk_count > 0 && (
                                                    <span style={styles.docChunks}>
                                                        {doc.chunk_count} чанков
                                                    </span>
                                                )}
                                                {doc.page_count > 0 && (
                                                    <span style={styles.docPages}>
                                                        {doc.page_count} стр.
                                                    </span>
                                                )}
                                                {doc.file_size && (
                                                    <span style={styles.docSize}>
                                                        {formatFileSize(doc.file_size)}
                                                    </span>
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
                </div>
            )}
        </>
    );
}

// Стили
const styles = {
    toggleBtn: {
        position: 'fixed',
        bottom: '80px',
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
        position: 'relative',
        ':hover': {
            background: 'var(--bg-hover)',
            color: 'var(--text-primary)',
        },
    },
    badge: {
        position: 'absolute',
        top: '-4px',
        right: '-4px',
        background: 'var(--accent)',
        color: '#fff',
        fontSize: '10px',
        fontWeight: 600,
        borderRadius: '50%',
        width: '20px',
        height: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    accessDenied: {
        padding: '20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
    },
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
        maxWidth: '900px',
        width: '95%',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
    },
    title: {
        fontSize: '20px',
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
    message: {
        padding: '12px 16px',
        borderRadius: '8px',
        fontSize: '14px',
        marginBottom: '16px',
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
    dropZone: {
        border: '2px dashed var(--border)',
        borderRadius: '12px',
        padding: '40px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'var(--transition)',
        marginBottom: '20px',
        ':hover': {
            borderColor: 'var(--accent)',
            background: 'rgba(59,130,246,0.05)',
        },
    },
    dropIcon: {
        marginBottom: '12px',
    },
    dropText: {
        fontSize: '16px',
        color: 'var(--text-secondary)',
        marginBottom: '4px',
    },
    dropLink: {
        color: 'var(--accent)',
        cursor: 'pointer',
        textDecoration: 'underline',
    },
    dropHint: {
        fontSize: '13px',
        color: 'var(--text-muted)',
    },
    dropInput: {
        display: 'none',
    },
    selectedFiles: {
        marginBottom: '20px',
        padding: '16px',
        background: 'var(--bg-input)',
        borderRadius: '8px',
    },
    selectedHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        fontSize: '14px',
        color: 'var(--text-secondary)',
    },
    clearBtn: {
        color: 'var(--danger)',
        fontSize: '13px',
        cursor: 'pointer',
        ':hover': {
            opacity: 0.7,
        },
    },
    selectedFile: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 10px',
        background: 'var(--bg-sidebar)',
        borderRadius: '6px',
        marginBottom: '6px',
    },
    fileIcon: {
        fontSize: '16px',
    },
    fileNameInput: {
        flex: 1,
        background: 'transparent',
        color: 'var(--text-primary)',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid transparent',
        fontSize: '14px',
        ':focus': {
            borderColor: 'var(--accent)',
        },
    },
    fileSize: {
        fontSize: '12px',
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
        fontSize: '16px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'var(--transition)',
        marginTop: '10px',
        ':hover': {
            background: 'var(--accent-hover)',
        },
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
        },
    },
    documentsList: {
        marginTop: '16px',
        maxHeight: '400px',
        overflow: 'auto',
    },
    listHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 4px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '10px',
        fontSize: '14px',
        fontWeight: 500,
        color: 'var(--text-secondary)',
    },
    docCount: {
        background: 'var(--bg-input)',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '12px',
    },
    loading: {
        textAlign: 'center',
        padding: '20px',
        color: 'var(--text-muted)',
    },
    empty: {
        textAlign: 'center',
        padding: '30px',
        color: 'var(--text-muted)',
        fontSize: '14px',
    },
    docItem: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        gap: '10px',
        ':hover': {
            background: 'var(--bg-hover)',
        },
    },
    docInfo: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    docName: {
        fontWeight: 500,
        fontSize: '14px',
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '200px',
    },
    docOriginal: {
        fontSize: '12px',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '150px',
    },
    docStatus: {
        fontSize: '12px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
    },
    docMeta: {
        display: 'flex',
        gap: '12px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
    },
    docDate: {},
    docChunks: {},
    docPages: {},
    docSize: {},
    docActions: {
        display: 'flex',
        gap: '6px',
    },
    reprocessBtn: {
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '14px',
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
        fontSize: '14px',
        cursor: 'pointer',
        background: 'var(--bg-input)',
        color: 'var(--danger)',
        ':hover': {
            background: 'rgba(239,68,68,0.1)',
        },
    },
};