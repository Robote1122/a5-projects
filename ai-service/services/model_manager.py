# ai-service/services/model_manager.py
import os
import logging
import threading
from typing import Optional
from gigachat import GigaChat
import requests

logger = logging.getLogger(__name__)

class ModelManager:
    """Менеджер моделей GigaChat с динамической перезагрузкой"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        
        self.gigachat_auth = os.getenv("GIGACHAT_AUTH_DATA")
        self.backend_url = os.getenv("BACKEND_URL", "http://backend:8001")
        
        # Загружаем настройки из БД
        self._load_settings_from_db()
        
        # Инициализируем клиент
        self._init_client()
        
        logger.info(f"✅ ModelManager инициализирован с моделью: {self.current_model}")
    
    def _load_settings_from_db(self):
        """Загружает настройки из PostgreSQL"""
        try:
            response = requests.get(
                f"{self.backend_url}/api/settings",
                timeout=5
            )
            if response.status_code == 200:
                settings = response.json().get('data', [])
                for setting in settings:
                    if setting['key'] == 'gigachat_model':
                        self.current_model = setting['value']
                    elif setting['key'] == 'gigachat_embed_model':
                        self.current_embed_model = setting['value']
                return
        except Exception as e:
            logger.warning(f"⚠️ Не удалось загрузить настройки из БД: {e}")
        
        # Значения по умолчанию
        self.current_model = os.getenv("GIGACHAT_CHAT_MODEL", "GigaChat-Pro")
        self.current_embed_model = os.getenv("GIGACHAT_EMBED_MODEL", "Embeddings")
    
    def _init_client(self):
        """Инициализирует или пересоздает клиент GigaChat"""
        try:
            # Закрываем старый клиент если есть
            if hasattr(self, 'giga_chat'):
                try:
                    self.giga_chat.close()
                except:
                    pass
            
            # Создаем новый клиент с текущей моделью
            self.giga_chat = GigaChat(
                credentials=self.gigachat_auth,
                verify_ssl_certs=False,
                timeout=120,
                model=self.current_model
            )
            
            # Embedding клиент
            if hasattr(self, 'giga_embed'):
                try:
                    self.giga_embed.close()
                except:
                    pass
            
            self.giga_embed = GigaChat(
                credentials=self.gigachat_auth,
                verify_ssl_certs=False,
                timeout=60,
                model=self.current_embed_model
            )
            
            logger.info(f"✅ Клиент GigaChat пересоздан с моделью: {self.current_model}")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка инициализации GigaChat: {e}")
            return False
    
    def reload(self):
        """Перезагружает настройки и пересоздает клиент"""
        with self._lock:
            old_model = self.current_model
            self._load_settings_from_db()
            
            if old_model != self.current_model:
                logger.info(f"🔄 Модель изменена: {old_model} → {self.current_model}")
                return self._init_client()
            else:
                logger.info(f"ℹ️ Модель не изменилась: {self.current_model}")
                return True
    
    def get_chat_client(self):
        """Возвращает текущий клиент для чата"""
        return self.giga_chat
    
    def get_embed_client(self):
        """Возвращает текущий клиент для эмбеддингов"""
        return self.giga_embed
    
    def get_current_model(self):
        """Возвращает текущую модель"""
        return self.current_model
    
    def get_available_models(self):
        """Возвращает список доступных моделей"""
        return [
            "GigaChat-Pro",
            "GigaChat-Max",
            "GigaChat-Lite",
            "GigaChat",
            "Embeddings"
        ]

# Создаем глобальный экземпляр
model_manager = ModelManager()