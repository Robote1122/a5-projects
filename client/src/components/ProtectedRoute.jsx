/**
 * components/ProtectedRoute.jsx
 * Защита маршрутов от неавторизованного доступа
 */

import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requireAdmin = false }) {
    const { isAuthenticated, loading, user, checkAuth } = useAuth();
    const location = useLocation();

    console.log('🛡️ [ProtectedRoute] Рендер', {
        isAuthenticated,
        loading,
        path: location.pathname,
        user: user?.email || 'нет',
        requireAdmin
    });

    // Проверяем авторизацию при загрузке защищённого маршрута
    useEffect(() => {
        console.log('🛡️ [ProtectedRoute] Проверка авторизации');
        if (!isAuthenticated && !loading) {
            checkAuth();
        }
    }, [isAuthenticated, loading, checkAuth]);

    if (loading) {
        console.log('🛡️ [ProtectedRoute] Показываем индикатор загрузки');
        return (
            <div style={styles.loading}>
                <span>Загрузка...</span>
            </div>
        );
    }

    if (!isAuthenticated) {
        console.log('🛡️ [ProtectedRoute] Не авторизован, редирект на /login');
        return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    }

    if (requireAdmin && user?.role !== 'ADMIN') {
        console.log('🛡️ [ProtectedRoute] Недостаточно прав, редирект на /');
        return <Navigate to="/" replace />;
    }

    console.log('🛡️ [ProtectedRoute] Доступ разрешён');
    return children;
}

const styles = {
    loading: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--text-muted)',
        fontSize: '16px',
    },
};