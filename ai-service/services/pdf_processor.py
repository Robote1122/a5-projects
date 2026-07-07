# ai-service/services/pdf_processor.py
import os
import json
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
import base64
import io
from pdf2image import convert_from_path
from openai import OpenAI
from gigachat import GigaChat
import time
import hashlib

logger = logging.getLogger(__name__)

class PDFProcessor:
    """Обработчик PDF с извлечением текста через OpenRouter Vision API и структурированием через GigaChat Pro"""
    
    def __init__(self):
        # Настройки OpenRouter для OCR
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY",'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')
        self.openrouter_base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.openrouter_model = os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free")
        self.dpi = int(os.getenv("OCR_DPI", 200))
        
        # Загрузка промптов
        self.ocr_prompt_path = os.getenv("OCR_PROMPT_PATH", "./prompts/ocr_prompt.txt")
        self.structure_prompt_path = os.getenv("STRUCTURE_PROMPT_PATH", "./prompts/structure_prompt.txt")
        self.ocr_prompt = self._load_prompt(self.ocr_prompt_path)
        self.structure_prompt = self._load_prompt(self.structure_prompt_path)
        
        # Настройки GigaChat
        self.gigachat_auth = os.getenv("GIGACHAT_AUTH_DATA")
        self.chunk_size = int(os.getenv("CHUNK_SIZE", 500))
        self.chunk_overlap = int(os.getenv("CHUNK_OVERLAP", 100))
        
        # Инициализация OpenRouter клиента
        logger.info("🔗 Подключение к OpenRouter Vision API...")
        if not self.openrouter_api_key:
            raise ValueError("OPENROUTER_API_KEY не задан в .env")
        
        self.openrouter_client = OpenAI(
            api_key=self.openrouter_api_key,
            base_url=self.openrouter_base_url
        )
        logger.info(f"✅ OpenRouter клиент инициализирован (модель: {self.openrouter_model})")
        
        # Инициализация GigaChat Pro для структурирования
        logger.info("🔗 Подключение к GigaChat Pro...")
        self.giga_pro = GigaChat(
            credentials=self.gigachat_auth,
            verify_ssl_certs=False,
            timeout=120,
            model="GigaChat-Pro"
        )
        logger.info("✅ GigaChat Pro инициализирован")
        
        # Инициализация GigaChat для эмбеддингов
        logger.info("🔗 Подключение к GigaChat Embeddings...")
        self.giga_embed = GigaChat(
            credentials=self.gigachat_auth,
            verify_ssl_certs=False,
            timeout=60,
            model="Embeddings"
        )
        logger.info("✅ GigaChat Embeddings инициализирован")
    
    def _load_prompt(self, path: str) -> str:
        """Загрузка промпта из файла"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            logger.warning(f"⚠️ Промпт не найден: {path}, использую дефолтный")
            return ""
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Извлечение текста из PDF через OpenRouter Vision API (постранично)"""
        logger.info(f"📄 Извлечение текста из {pdf_path} через OpenRouter Vision API")
        
        # Конвертируем PDF в изображения
        logger.info(f"🖼️ Конвертация PDF в изображения (DPI={self.dpi})...")
        try:
            pages = convert_from_path(pdf_path, dpi=self.dpi)
            logger.info(f"✅ Получено {len(pages)} страниц")
        except Exception as e:
            logger.error(f"❌ Ошибка конвертации PDF: {e}")
            raise ValueError(f"Не удалось конвертировать PDF: {e}")
        
        full_text = ""
        page_number = 1
        
        for page in pages:
            logger.info(f"📖 Обработка страницы {page_number}/{len(pages)}...")
            
            try:
                # Конвертируем страницу в PNG
                buf = io.BytesIO()
                page.save(buf, format="PNG")
                image_base64 = base64.b64encode(buf.getvalue()).decode()
                
                # Отправляем запрос в OpenRouter
                response = self.openrouter_client.chat.completions.create(
                    model=self.openrouter_model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": self.ocr_prompt
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{image_base64}"
                                    }
                                }
                            ]
                        }
                    ],
                    temperature=0.1
                )
                
                page_text = response.choices[0].message.content
                full_text += f"\n--- Страница {page_number} ---\n{page_text}\n"
                
                logger.info(f"✅ Страница {page_number} обработана ({len(page_text)} символов)")
                
                # Небольшая задержка между запросами
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"❌ Ошибка обработки страницы {page_number}: {e}")
                full_text += f"\n--- Страница {page_number} (ОШИБКА) ---\n[Не удалось извлечь текст: {str(e)}]\n"
            
            page_number += 1
        
        if not full_text.strip() or len(full_text.strip()) < 100:
            raise ValueError("Не удалось извлечь текст из PDF. Возможно, документ повреждён.")
        
        logger.info(f"✅ Извлечено всего {len(full_text)} символов")
        return full_text
    
    def structure_text_with_giga(self, text: str, max_retries: int = 3) -> List[Dict[str, Any]]:
        """Структурирование текста через GigaChat Pro"""
        logger.info("🧠 Структурирование текста через GigaChat Pro...")
        
        # Обрезаем текст если слишком длинный
        text_for_prompt = text[:15000]  # Ограничиваем для API
        if len(text) > 15000:
            logger.warning(f"⚠️ Текст обрезан с {len(text)} до 15000 символов")
        
        prompt = self.structure_prompt.replace("{text}", text_for_prompt)
        
        for attempt in range(max_retries):
            try:
                response = self.giga_pro.chat(prompt)
                content = response.choices[0].message.content
                
                # Очищаем ответ от маркеров кода
                content = content.strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
                
                # Парсим JSON
                structured_data = json.loads(content)
                
                if not isinstance(structured_data, list):
                    raise ValueError("Ожидался массив объектов")
                
                logger.info(f"✅ Структурировано {len(structured_data)} блоков")
                return structured_data
                
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ Ошибка парсинга JSON (попытка {attempt+1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                else:
                    logger.warning("🔄 Использую fallback-структурирование")
                    return self._fallback_structure(text)
                    
            except Exception as e:
                logger.error(f"❌ Ошибка структурирования: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                else:
                    raise
    
    def _fallback_structure(self, text: str) -> List[Dict[str, Any]]:
        """Fallback-структурирование текста по абзацам"""
        paragraphs = text.split('\n\n')
        structured = []
        
        for i, para in enumerate(paragraphs):
            if len(para.strip()) > 20:
                lines = para.strip().split('\n')
                title = lines[0][:100] if lines else f"Блок {i+1}"
                content = '\n'.join(lines[1:]) if len(lines) > 1 else para
                
                structured.append({
                    "title": title.strip(),
                    "content": content.strip(),
                    "keywords": self._extract_keywords(content)
                })
        
        return structured
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Извлечение ключевых слов из текста"""
        stop_words = {'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'за', 'под', 'над', 'о', 'об', 'при', 'без'}
        words = text.lower().split()
        word_freq = {}
        
        for word in words:
            word = word.strip('.,!?;:()"\'')
            if len(word) > 3 and word not in stop_words:
                word_freq[word] = word_freq.get(word, 0) + 1
        
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, _ in sorted_words[:5]]
    
    def chunk_text(self, structured_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Разбивка структурированного текста на чанки"""
        chunks = []
        
        for block in structured_data:
            title = block.get("title", "")
            content = block.get("content", "")
            keywords = block.get("keywords", [])
            
            full_text = f"{title}\n{content}"
            
            words = full_text.split()
            current_chunk = []
            current_size = 0
            
            for word in words:
                current_chunk.append(word)
                current_size += 1
                
                if current_size >= self.chunk_size:
                    chunk_text = ' '.join(current_chunk)
                    chunks.append({
                        "text": chunk_text,
                        "title": title,
                        "keywords": keywords,
                        "chunk_index": len(chunks)
                    })
                    overlap_words = current_chunk[-self.chunk_overlap:]
                    current_chunk = overlap_words
                    current_size = len(overlap_words)
            
            if current_chunk:
                chunk_text = ' '.join(current_chunk)
                chunks.append({
                    "text": chunk_text,
                    "title": title,
                    "keywords": keywords,
                    "chunk_index": len(chunks)
                })
        
        logger.info(f"📦 Создано {len(chunks)} чанков")
        return chunks
    
    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Генерация эмбеддингов через GigaChat Embeddings"""
        logger.info(f"🧠 Генерация эмбеддингов для {len(texts)} текстов...")
        
        embeddings = []
        batch_size = 10
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            try:
                response = self.giga_embed.embeddings(batch)
                batch_embeddings = [item.embedding for item in response.data]
                embeddings.extend(batch_embeddings)
                logger.info(f"✅ Сгенерировано {len(batch_embeddings)} эмбеддингов")
            except Exception as e:
                logger.error(f"❌ Ошибка генерации эмбеддингов: {e}")
                raise
        
        return embeddings
    
    def process_pdf(self, pdf_path: str, custom_name: str, document_id: str) -> Dict[str, Any]:
        """Полный цикл обработки PDF"""
        logger.info(f"🔄 Обработка PDF: {custom_name} (ID: {document_id})")
        
        try:
            # 1. Извлечение текста через OpenRouter Vision API
            raw_text = self.extract_text_from_pdf(pdf_path)
            
            # 2. Структурирование через GigaChat Pro
            structured_data = self.structure_text_with_giga(raw_text)
            
            # 3. Чанкинг
            chunks = self.chunk_text(structured_data)
            
            if not chunks:
                raise ValueError("Не удалось создать чанки из документа")
            
            # 4. Генерация эмбеддингов
            chunk_texts = [chunk["text"] for chunk in chunks]
            embeddings = self.generate_embeddings(chunk_texts)
            
            # 5. Подготовка данных для ChromaDB
            documents_data = []
            for chunk, embedding in zip(chunks, embeddings):
                documents_data.append({
                    "id": f"{document_id}_{chunk['chunk_index']}",
                    "text": chunk["text"],
                    "embedding": embedding,
                    "metadata": {
                        "document_id": document_id,
                        "source": custom_name,
                        "title": chunk["title"],
                        "keywords": ", ".join(chunk["keywords"]),
                        "chunk_index": chunk["chunk_index"],
                        "total_chunks": len(chunks),
                        "processed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                })
            
            # Считаем количество страниц (приблизительно)
            page_count = raw_text.count("--- Страница")
            
            return {
                "success": True,
                "document_id": document_id,
                "source": custom_name,
                "total_chunks": len(chunks),
                "chunks": documents_data,
                "pages": page_count
            }
            
        except Exception as e:
            logger.error(f"❌ Ошибка обработки PDF: {e}")
            return {
                "success": False,
                "document_id": document_id,
                "source": custom_name,
                "error": str(e)
            }