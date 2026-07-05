/**
 * context/AuthContext.jsx
 * Контекст для управления состоянием авторизации
 */

import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Настройка axios для отправки cookie
    axios.defaults.withCredentials = true;

    // Проверка авторизации при загрузке
    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/auth/me');
            if (response.data.success) {
                setUser(response.data.data);
            } else {
                setUser(null);
            }
        } catch (err) {
            setUser(null);
            if (err.response?.status !== 401) {
                console.error('Auth check error:', err);
            }
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        setError(null);
        try {
            const response = await axios.post('/api/auth/login', { email, password });
            if (response.data.success) {
                setUser(response.data.data.user);
                return { success: true };
            }
            return { success: false, error: 'Ошибка входа' };
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Ошибка соединения с сервером';
            setError(errorMsg);
            return { success: false, error: errorMsg };
        }
    };

    const logout = async () => {
        try {
            await axios.post('/api/auth/logout');
            setUser(null);
        } catch (err) {
            console.error('Logout error:', err);
        }
    };

    const value = {
        user,
        loading,
        error,
        login,
        logout,
        checkAuth,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'ADMIN',
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};