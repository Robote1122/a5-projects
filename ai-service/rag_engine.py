# ai-service/rag_engine.py
import chromadb
from gigachat import GigaChat
import numpy as np
import os
import json
from typing import List, AsyncGenerator, Dict, Any
import asyncio
from dotenv import load_dotenv
import logging
from chromadb.config import Settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

class RAGEngine:
    def __init__(self):
        self.db_path = os.getenv("DB_PATH", "./safety_checklist_db")
        self.gigachat_auth = os.getenv("GIGACHAT_AUTH_DATA")
        self.prompt_start_path = os.getenv("PROMPT_1_PATH", "./prompt_start.txt")
        self.prompt_continue_path = os.getenv("PROMPT_2_PATH", "./prompt_continue.txt")
        
        self.embed_model = os.getenv("GIGACHAT_EMBED_MODEL", "Embeddings")
        self.chat_model = os.getenv("GIGACHAT_CHAT_MODEL", "GigaChat")
        
        logger.info(f"🔍 Путь к БД: {self.db_path}")
        
        self.client = chromadb.PersistentClient(path=self.db_path,settings=Settings(anonymized_telemetry=False))
        try:
            self.collection = self.client.get_collection("safety_checklists")
            logger.info(f"✅ Коллекция найдена. Документов: {self.collection.count()}")
        except:
            logger.warning("⚠️ Коллекция не найдена")
            self.collection = None
        
        self.giga_embed = GigaChat(
            credentials=self.gigachat_auth,
            verify_ssl_certs=False,
            timeout=60,
            model=self.embed_model
        )
        
        self.giga_chat = GigaChat(
            credentials=self.gigachat_auth,
            verify_ssl_certs=False,
            timeout=120,
            model=self.chat_model
        )
        logger.info("✅ GigaChat инициализирован")
    
    def search(self, query: str, n_results: int = 3) -> List[Dict[str, Any]]:
        if not self.collection:
            return [{
                "content": "База знаний пуста. Загрузите документы через панель администратора.",
                "source": "Система",
                "relevance": 0
            }]
        
        try:
            response = self.giga_embed.embeddings([query])
            query_embedding = response.data[0].embedding
            
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                include=["documents", "metadatas", "distances"]
            )
            
            contexts = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    meta = results['metadatas'][0][i] if results['metadatas'] and results['metadatas'][0] else {}
                    dist = results['distances'][0][i] if results['distances'] and results['distances'][0] else 0
                    
                    source = meta.get('source', 'Неизвестный источник')
                    title = meta.get('title', '')
                    
                    contexts.append({
                        "content": doc,
                        "source": source,
                        "title": title,
                        "metadata": meta,
                        "relevance": 1 - dist if dist < 1 else 0
                    })
            
            return contexts
            
        except Exception as e:
            logger.error(f"❌ Ошибка поиска: {e}")
            return [{
                "content": f"Ошибка при поиске: {str(e)}",
                "source": "Система",
                "relevance": 0
            }]
    
    async def generate_response(
        self, 
        query: str, 
        context: List[Dict[str, Any]], 
        history: List[Dict] = []
    ) -> AsyncGenerator[str, None]:
        
        has_context = context and len(context) > 0 and context[0].get("content") and not "Ошибка" in context[0].get("content", "")
        
        if has_context:
            context_text = "\n\n".join([
                f"Источник: {c.get('source', 'Неизвестный')}\n"
                f"Заголовок: {c.get('title', 'Без заголовка')}\n"
                f"Релевантность: {c.get('relevance', 0):.2f}\n"
                f"Содержание: {c.get('content', '')}"
                for c in context if c.get('content')
            ])
            
            sources_list = list(set([c.get('source', 'Неизвестный') for c in context if c.get('source')]))
            sources_text = "\n".join([f"📄 {s}" for s in sources_list])
        else:
            context_text = "Нет релевантных документов в базе знаний."
            sources_text = "Нет источников"
        
        history_text = ""
        if history:
            history_text = "\n".join([
                f"{'Пользователь' if msg.get('role') == 'user' else 'Ассистент'}: {msg.get('content', '')}"
                for msg in history[-5:] if msg.get('content')
            ])
        
        if has_context:
            prompt = ''.join([i for i in open(self.prompt_continue_path, encoding='utf-8')]) + f"""

Источники информации:
{sources_text}

Контекст из базы знаний:
{context_text}

История диалога:
{history_text}

Вопрос пользователя: {query}

Важно: 
1. В начале ответа перечисли все использованные источники
2. Ссылайся на конкретные документы при ответе
3. Если информации недостаточно, честно скажи об этом

Ответь подробно, ссылаясь на конкретные пункты из документов:
"""
        else:
            prompt = ''.join([i for i in open(self.prompt_start_path, encoding='utf-8')]) + f"""

Вопрос пользователя: {query}

База знаний пуста или не содержит релевантной информации.

Ответь вежливо, объясни что в базе знаний нет информации по этому запросу, 
и предложи загрузить соответствующие документы через панель администратора.
"""
        
        try:
            for chunk in self.giga_chat.stream(prompt):
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.error(f"❌ Ошибка генерации: {e}")
            yield f"Извините, произошла ошибка при генерации ответа: {str(e)}"
    
    def get_collection_count(self) -> int:
        try:
            if self.collection:
                return self.collection.count()
            return 0
        except:
            return 0