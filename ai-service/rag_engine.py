import chromadb
from gigachat import GigaChat
import numpy as np
import os
import json
from typing import List, AsyncGenerator
import asyncio
from dotenv import load_dotenv

load_dotenv()

class RAGEngine:
    def __init__(self):
        self.db_path = os.getenv("DB_PATH", "./safety_checklist_db")
        self.gigachat_auth = os.getenv("GIGACHAT_AUTH_DATA")
        self.gigachat_model = os.getenv("GIGACHAT_MODEL", "Embeddings")
        
        # Подключение к ChromaDB
        self.client = chromadb.PersistentClient(path=self.db_path)
        self.collection = self.client.get_collection("safety_checklist_db")
        
        # Инициализация GigaChat
        self.giga = GigaChat(
            credentials=self.gigachat_auth,
            verify_ssl_certs=False,
            timeout=60,
            model=self.gigachat_model
        )
    
    def search(self, query: str, n_results: int = 3) -> List[dict]:
        """Поиск релевантных документов в векторной БД"""
        # Получаем эмбеддинг запроса
        response = self.giga.embeddings([query])
        query_embedding = response.data[0].embedding
        
        # Поиск
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["documents", "metadatas", "distances"]
        )
        
        # Форматируем результат
        contexts = []
        for i, (doc, meta) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0]
        )):
            contexts.append({
                "content": doc,
                "metadata": meta,
                "relevance": 1 - results['distances'][0][i]  # простое преобразование
            })
        
        return contexts
    
    async def generate_response(
        self, 
        query: str, 
        context: List[dict], 
        history: List[dict] = []
    ) -> AsyncGenerator[str, None]:
        """Генерация ответа с учетом контекста из векторной БД"""
        
        # Формируем промпт с контекстом
        context_text = "\n\n".join([
            f"Документ {i+1} (релевантность: {c['relevance']:.2f}):\n{c['content']}"
            for i, c in enumerate(context)
        ])
        
        # Формируем историю
        history_text = ""
        if history:
            history_text = "\n".join([
                f"{'Пользователь' if msg['role'] == 'user' else 'Ассистент'}: {msg['content']}"
                for msg in history[-5:]  # последние 5 сообщений
            ])
        
        prompt = f"""
Ты — технический эксперт завода. Твоя задача — отвечать на вопросы пользователей строго на основе предоставленных документов (файлов, таблиц, инструкций).

Правила твоей работы:
1. ВСЕГДА в начале ответа указывай, из какого именно файла (или файлов) ты взял информацию. Называй точное имя файла, например: «Согласно документу «Инструкция по ТО-2026.pdf»...» Если использовано несколько файлов, перечисли их все.
2. Отвечай чётко, по делу, без лишней воды. Используй технический язык, понятный рабочим и инженерам.
3. Если в загруженных данных нет ответа на вопрос — прямо скажи: «В предоставленных файлах эта информация отсутствует. Пожалуйста, уточните запрос или добавьте нужные документы.» Никогда не выдумывай ответы из своей «головы».
4. Если вопрос требует расчёта или сравнения цифр — делай это аккуратно, показывая исходные данные из таблиц.
5. Отвечай на русском языке, грамотно, но без излишней вежливости — только факты.

Контекст из базы знаний:
{context_text}

История диалога:
{history_text}

Вопрос пользователя: {query}

Ответь подробно, ссылаясь на конкретные пункты из чек-листов. Если информации недостаточно, честно скажи об этом.
Помни: ты работаешь на производстве, ошибки недопустимы. Всегда перепроверяй источник.
"""
        
        # Стриминг ответа от GigaChat
        try:
            # Используем streaming API
            for chunk in self.giga.stream(prompt):
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield f"Извините, произошла ошибка при генерации ответа: {str(e)}"
    
    def get_collection_count(self) -> int:
        """Количество документов в БД"""
        return self.collection.count()