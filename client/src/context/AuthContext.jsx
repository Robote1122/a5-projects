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

    axios.defaults.withCredentials = true;

    // Проверка авторизации при загрузке
    useEffect(() => {
        console.log('🔍 [AuthProvider] Проверка авторизации при монтировании');
        checkAuth();
    }, []);

    const checkAuth = async () => {
        console.log('🔍 [checkAuth] Начинаем проверку авторизации...');
        setLoading(true);
        try {
            const response = await axios.get('/api/auth/me');
            console.log('🔍 [checkAuth] Ответ от /api/auth/me:', response.data);
            
            if (response.data.success) {
                console.log('✅ [checkAuth] Пользователь авторизован:', response.data.data);
                setUser(response.data.data);
                return true;
            } else {
                console.log('❌ [checkAuth] Не авторизован (success: false)');
                setUser(null);
                return false;
            }
        } catch (err) {
            console.error('❌ [checkAuth] Ошибка при проверке авторизации:', {
                status: err.response?.status,
                data: err.response?.data,
                message: err.message
            });
            setUser(null);
            return false;
        } finally {
            setLoading(false);
            console.log('🔍 [checkAuth] Завершено, loading = false');
        }
    };

    const login = async (email, password) => {
        console.log('🔑 [login] Попытка входа с email:', email);
        setError(null);
        setLoading(true);
        try {
            const response = await axios.post('/api/auth/login', { email, password });
            console.log('🔑 [login] Ответ от /api/auth/login:', response.data);
            
            if (response.data.success) {
                console.log('✅ [login] Вход успешен, пользователь:', response.data.data.user);
                setUser(response.data.data.user);
                return { success: true };
            }
            return { success: false, error: 'Ошибка входа' };
        } catch (err) {
            const errorMsg = err.response?.data?.error || 'Ошибка соединения с сервером';
            console.error('❌ [login] Ошибка при входе:', errorMsg);
            setError(errorMsg);
            return { success: false, error: errorMsg };
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        console.log('🚪 [logout] Выход из системы');
        try {
            await axios.post('/api/auth/logout');
            setUser(null);
        } catch (err) {
            console.error('❌ [logout] Ошибка при выходе:', err);
            setUser(null);
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