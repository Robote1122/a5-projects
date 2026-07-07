/**
 * pages/LoginPage.jsx
 * Страница входа
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [localError, setLocalError] = useState('');
    const { user, login, error, isAuthenticated, checkAuth } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const authCheckedRef = useRef(false); // ⭐ Флаг для предотвращения повторных проверок

    console.log('📄 [LoginPage] Рендер', { 
        isAuthenticated, 
        user: user?.email || 'нет',
        authChecked: authCheckedRef.current
    });

    // Проверяем авторизацию только один раз при загрузке
    useEffect(() => {
        console.log('📄 [LoginPage] Проверка авторизации на странице логина');
        
        // ⭐ Если уже авторизованы — редирект
        if (isAuthenticated) {
            const from = location.state?.from || '/';
            console.log('📄 [LoginPage] Уже авторизован, редирект на:', from);
            navigate(from, { replace: true });
            return;
        }
        
        // ⭐ Проверяем только если ещё не проверяли и не в процессе логаута
        if (!authCheckedRef.current) {
            authCheckedRef.current = true;
            
            const verifyAuth = async () => {
                const isAuth = await checkAuth();
                if (isAuth) {
                    const from = location.state?.from || '/';
                    console.log('📄 [LoginPage] Авторизация подтверждена, редирект на:', from);
                    navigate(from, { replace: true });
                }
            };
            
            verifyAuth();
        }
    }, [isAuthenticated, checkAuth, navigate, location]);

    // Реагируем на изменение isAuthenticated
    useEffect(() => {
        if (isAuthenticated) {
            const from = location.state?.from || '/';
            console.log('📄 [LoginPage] isAuthenticated стал true, редирект на:', from);
            navigate(from, { replace: true });
        }
    }, [isAuthenticated, navigate, location]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        console.log('📄 [LoginPage] Отправка формы логина');
        setLocalError('');
        setLoading(true);

        const result = await login(email, password);
        setLoading(false);

        if (!result.success) {
            setLocalError(result.error || 'Ошибка входа');
            authCheckedRef.current = false; // ⭐ Разрешаем повторную проверку при ошибке
        }
    };

    // Если уже авторизованы — показываем загрузку
    if (isAuthenticated) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <div style={styles.loadingText}>Перенаправление...</div>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.header}>
                    <h1 style={styles.title}>Вход в чат</h1>
                    <p style={styles.subtitle}>Войдите в свой аккаунт</p>
                </div>

                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.field}>
                        <label style={styles.label}>Email</label>
                        <input
                            type="email"
                            style={styles.input}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="user1@chat.com"
                            required
                            disabled={loading}
                            autoComplete="email"
                        />
                    </div>

                    <div style={styles.field}>
                        <label style={styles.label}>Пароль</label>
                        <input
                            type="password"
                            style={styles.input}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            disabled={loading}
                            minLength={6}
                            autoComplete="current-password"
                        />
                    </div>

                    {(localError || error) && (
                        <div style={styles.error}>
                            {localError || error}
                        </div>
                    )}

                    <button
                        type="submit"
                        style={styles.button}
                        disabled={loading}
                    >
                        {loading ? 'Вход...' : 'Войти'}
                    </button>
                </form>

                <div style={styles.footer}>
                    <span style={styles.footerText}>
                        Тестовые аккаунты: user1@chat.com / user123
                    </span>
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-base)',
        padding: '20px',
    },
    card: {
        width: '100%',
        maxWidth: '400px',
        background: 'var(--bg-sidebar)',
        borderRadius: '16px',
        padding: '40px',
        border: '1px solid var(--border)',
    },
    header: {
        textAlign: 'center',
        marginBottom: '32px',
    },
    title: {
        fontSize: '24px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: '8px',
    },
    subtitle: {
        fontSize: '14px',
        color: 'var(--text-muted)',
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
    },
    field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
    },
    label: {
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-secondary)',
    },
    input: {
        padding: '10px 14px',
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        fontSize: '14px',
        color: 'var(--text-primary)',
        outline: 'none',
        transition: 'border-color 0.2s',
        ':focus': {
            borderColor: 'var(--accent)',
        },
    },
    button: {
        padding: '12px',
        background: 'var(--accent)',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '16px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 0.2s',
        marginTop: '8px',
        ':hover': {
            background: 'var(--accent-hover)',
        },
        ':disabled': {
            opacity: 0.6,
            cursor: 'not-allowed',
        },
    },
    error: {
        padding: '10px 14px',
        background: 'rgba(239,68,68,0.15)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '8px',
        color: '#ef4444',
        fontSize: '13px',
        textAlign: 'center',
    },
    footer: {
        marginTop: '24px',
        textAlign: 'center',
        paddingTop: '16px',
        borderTop: '1px solid var(--border)',
    },
    footerText: {
        fontSize: '12px',
        color: 'var(--text-muted)',
    },
    loadingText: {
        textAlign: 'center',
        color: 'var(--text-secondary)',
        padding: '20px 0',
        fontSize: '16px',
    },
};