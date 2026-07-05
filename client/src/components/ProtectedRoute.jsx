/**
 * components/ProtectedRoute.jsx
 * Защита маршрутов от неавторизованного доступа
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requireAdmin = false }) {
    const { isAuthenticated, loading, user } = useAuth();
    const location = useLocation();

    // Показываем индикатор загрузки
    if (loading) {
        return (
            <div style={styles.loading}>
                <span>Загрузка...</span>
            </div>
        );
    }

    // Если не авторизован — редирект на /login с сохранением текущего пути
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location.pathname }} replace />;
    }

    // Проверка на права администратора
    if (requireAdmin && user?.role !== 'ADMIN') {
        return <Navigate to="/" replace />;
    }

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