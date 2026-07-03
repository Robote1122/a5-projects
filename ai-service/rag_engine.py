import chromadb
from gigachat import GigaChat
import numpy as np
import os
import json
from typing import List, AsyncGenerator
import asyncio
from dotenv import load_dotenv
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

class RAGEngine:
    def __init__(self):
        # Путь к БД
        self.db_path = os.getenv("DB_PATH", "./safety_checklist_db")
        self.gigachat_auth = os.getenv("GIGACHAT_AUTH_DATA")
        self.prompt_start_path = os.getenv("PROMPT_1_PATH","./prompt_start.txt")
        self.prompt_continue_path = os.getenv("PROMPT_2_PATH","./prompt_continue.txt")
        
        # Модели
        self.embed_model = os.getenv("GIGACHAT_EMBED_MODEL", "Embeddings")
        self.chat_model = os.getenv("GIGACHAT_CHAT_MODEL", "GigaChat")
        
        logger.info(f"🔍 Путь к БД: {self.db_path}")
        logger.info(f"📊 Модель эмбеддингов: {self.embed_model}")
        logger.info(f"💬 Модель чата: {self.chat_model}")
        
        # Подключение к ChromaDB
        logger.info("🔗 Подключение к ChromaDB...")
        self.client = chromadb.PersistentClient(path=self.db_path)
        self.collection = self.client.get_collection("safety_checklists")
        logger.info(f"✅ Коллекция найдена. Документов: {self.collection.count()}")
        
        # Инициализация GigaChat для эмбеддингов
        logger.info("🔗 Подключение к GigaChat (Embeddings)...")
        self.giga_embed = GigaChat(
            credentials=self.gigachat_auth,
            verify_ssl_certs=False,
            timeout=60,
            model=self.embed_model
        )
        logger.info("✅ GigaChat Embeddings инициализирован")
        
        # Инициализация GigaChat для чата
        logger.info("🔗 Подключение к GigaChat (Chat)...")
        self.giga_chat = GigaChat(
            credentials=self.gigachat_auth,
            verify_ssl_certs=False,
            timeout=120,
            model=self.chat_model
        )
        logger.info("✅ GigaChat Chat инициализирован")
    
    def search(self, query: str, n_results: int = 3) -> List[dict]:
        """Поиск релевантных документов в векторной БД"""
        try:
            # Получаем эмбеддинг запроса через embed модель
            response = self.giga_embed.embeddings([query])
            query_embedding = response.data[0].embedding
            
            # Поиск
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                include=["documents", "metadatas", "distances"]
            )
            
            # Форматируем результат
            contexts = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    meta = results['metadatas'][0][i] if results['metadatas'] and results['metadatas'][0] else {}
                    dist = results['distances'][0][i] if results['distances'] and results['distances'][0] else 0
                    contexts.append({
                        "content": doc,
                        "metadata": meta,
                        "relevance": 1 - dist if dist < 1 else 0
                    })
            
            return contexts
            
        except Exception as e:
            logger.error(f"❌ Ошибка поиска: {e}")
            return [{
                "content": f"Ошибка при поиске: {str(e)}",
                "metadata": {"error": True},
                "relevance": 0
            }]
    
    async def generate_response(
        self, 
        query: str, 
        context: List[dict], 
        history: List[dict] = []
    ) -> AsyncGenerator[str, None]:
        """Генерация ответа с учетом контекста из векторной БД"""
        
        # Проверяем есть ли контекст
        has_context = context and len(context) > 0 and context[0].get("content") and not context[0].get("metadata", {}).get("error", False)
        
        # Формируем контекст
        if has_context:
            context_text = "\n\n".join([
                f"Документ {i+1} (релевантность: {c.get('relevance', 0):.2f}):\n{c.get('content', '')}"
                for i, c in enumerate(context) if c.get('content')
            ])
        else:
            context_text = "Нет релевантных документов в базе знаний."
        
        # Формируем историю
        history_text = ""
        if history:
            history_text = "\n".join([
                f"{'Пользователь' if msg.get('role') == 'user' else 'Ассистент'}: {msg.get('content', '')}"
                for msg in history[-5:] if msg.get('content')
            ])
        
        # Промпт
        if has_context:
            prompt = ''.join([i for i in open(self.prompt_continue_path,encoding='utf-8')])+f"""

Контекст из базы знаний:
{context_text}

История диалога:
{history_text}

Вопрос пользователя: {query}

Ответь подробно, ссылаясь на конкретные пункты из чек-листов. Если информации недостаточно, честно скажи об этом.
Помни: ты работаешь на производстве, ошибки недопустимы. Всегда перепроверяй источник.
"""
        else:
            prompt = ''.join([i for i in open(self.prompt_start_path,encoding='utf-8')])+f"""

Вопрос пользователя: {query}

Ответь вежливо, объясни что в базе знаний нет информации по этому запросу, и предложи уточнить вопрос или добавить соответствующие документы.
"""
        
        # Стриминг ответа через chat модель
        try:
            for chunk in self.giga_chat.stream(prompt):
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.error(f"❌ Ошибка генерации: {e}")
            yield f"Извините, произошла ошибка при генерации ответа: {str(e)}"
    
    def get_collection_count(self) -> int:
        """Количество документов в БД"""
        try:
            return self.collection.count()
        except:
            return 0