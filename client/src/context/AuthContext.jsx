// context/AuthContext.jsx

import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const isLoggingOutRef = useRef(false);
    const authCheckedRef = useRef(false);

    axios.defaults.withCredentials = true;

    useEffect(() => {
        console.log('🔍 [AuthProvider] Проверка авторизации при монтировании');
        if (!authCheckedRef.current && !isLoggingOutRef.current) {
            checkAuth();
        }
    }, []);

    const checkAuth = async () => {
        if (authCheckedRef.current && !isLoggingOutRef.current) {
            console.log('🔍 [checkAuth] Уже проверено, пропускаем');
            return isAuthenticated;
        }
        
        console.log('🔍 [checkAuth] Начинаем проверку авторизации...');
        setLoading(true);
        try {
            // ⭐ Используем validateStatus, чтобы не выбрасывать исключение для 401
            const response = await axios.get('/api/auth/me', {
                validateStatus: (status) => status < 500 // ✅ 401 и 404 не будут выбрасывать ошибку
            });
            
            console.log('🔍 [checkAuth] Статус ответа:', response.status);
            console.log('🔍 [checkAuth] Данные ответа:', response.data);
            
            // ⭐ Проверяем статус и данные
            if (response.status === 200 && response.data?.success) {
                console.log('✅ [checkAuth] Пользователь авторизован:', response.data.data);
                setUser(response.data.data);
                setIsAuthenticated(true);
                authCheckedRef.current = true;
                return true;
            } else {
                // ⭐ Сюда попадаем при 401 или если success: false
                console.log('❌ [checkAuth] Не авторизован (статус:', response.status, ')');
                setUser(null);
                setIsAuthenticated(false);
                authCheckedRef.current = true;
                return false;
            }
        } catch (err) {
            // ⭐ Сюда попадаем только при реальных ошибках (500, network error и т.д.)
            console.error('❌ [checkAuth] Критическая ошибка:', {
                status: err.response?.status,
                data: err.response?.data,
                message: err.message
            });
            setUser(null);
            setIsAuthenticated(false);
            authCheckedRef.current = true;
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
        isLoggingOutRef.current = false;
        try {
            const response = await axios.post('/api/auth/login', { email, password });
            console.log('🔑 [login] Ответ от /api/auth/login:', response.data);
            
            if (response.data.success) {
                console.log('✅ [login] Вход успешен, пользователь:', response.data.data.user);
                setUser(response.data.data.user);
                setIsAuthenticated(true);
                authCheckedRef.current = true;
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
        isLoggingOutRef.current = true;
        authCheckedRef.current = false;
        
        // ⭐ Сразу сбрасываем состояние
        setUser(null);
        setIsAuthenticated(false);
        
        try {
            await axios.post('/api/auth/logout');
        } catch (err) {
            console.error('❌ [logout] Ошибка при выходе:', err);
        } finally {
            // ⭐ Сбрасываем флаг через задержку
            setTimeout(() => {
                isLoggingOutRef.current = false;
            }, 200);
        }
    };

    const value = {
        user,
        loading,
        error,
        login,
        logout,
        checkAuth,
        isAuthenticated,
        isAdmin: user?.role === 'ADMIN',
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};