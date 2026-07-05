/**
 * components/ProtectedRoute.jsx
 * Защита маршрутов от неавторизованного доступа
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requireAdmin = false }) {
    const { isAuthenticated, loading, user } = useAuth();

    if (loading) {
        return (
            <div style={styles.loading}>
                <span>Загрузка...</span>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

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