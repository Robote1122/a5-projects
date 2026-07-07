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
    """Обработчик PDF с извлечением текста через RouterAI Vision API и структурированием через GigaChat Pro"""
    
    def __init__(self):
        # Настройки RouterAI для OCR
        self.routerai_api_key = os.getenv("ROUTERAI_API_KEY", 'sk-zPQd___OIws0MFqtm7NtNflQQ4Habea8')
        self.routerai_base_url = os.getenv("ROUTERAI_BASE_URL", "https://routerai.ru/api/v1")
        self.routerai_model = os.getenv("ROUTERAI_MODEL", "meta-llama/llama-3.2-11b-vision-instruct")
        self.dpi = int(os.getenv("OCR_DPI", 200))
        
        # Загрузка промптов
        self.ocr_prompt_path = os.getenv("OCR_PROMPT_PATH", "./prompts/ocr_prompt.txt")
        self.structure_prompt_path = os.getenv("STRUCTURE_PROMPT_PATH", "./prompts/structure_prompt.txt")
        
        # Настройки GigaChat
        self.gigachat_auth = os.getenv("GIGACHAT_AUTH_DATA")
        self.chunk_size = int(os.getenv("CHUNK_SIZE", 500))
        self.chunk_overlap = int(os.getenv("CHUNK_OVERLAP", 100))
        
        # Инициализация RouterAI клиента
        logger.info("🔗 Подключение к RouterAI Vision API...")
        if not self.routerai_api_key:
            raise ValueError("ROUTERAI_API_KEY не задан в .env")
        
        self.routerai_client = OpenAI(
            api_key=self.routerai_api_key,
            base_url=self.routerai_base_url
        )
        logger.info(f"✅ RouterAI клиент инициализирован (модель: {self.routerai_model})")
        logger.info(f"📍 RouterAI Base URL: {self.routerai_base_url}")
        
        # Инициализация GigaChat Pro для структурирования
        logger.info("🔗 Подключение к GigaChat Pro...")
        self.giga_pro = GigaChat(
            credentials=self.gigachat_auth,
            verify_ssl_certs=False,
            timeout=120,
            model="GigaChat-Max"
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
        """Динамическая загрузка промпта из файла"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            logger.warning(f"⚠️ Промпт не найден: {path}")
            return ""
    
    def _log_routerai_request(self, prompt: str, image_size: int):
        """Логирование запроса к RouterAI"""
        logger.info("=" * 60)
        logger.info("📤 ЗАПРОС К ROUTERAI")
        logger.info(f"   Модель: {self.routerai_model}")
        logger.info(f"   Размер изображения: {image_size} байт")
        logger.info(f"   Длина промпта: {len(prompt)} символов")
        logger.info(f"   Промпт (первые 200 символов): {prompt[:200]}...")
        logger.info("=" * 60)
    
    def _log_routerai_response(self, response, page_number: int):
        """Логирование ответа от RouterAI"""
        logger.info("=" * 60)
        logger.info(f"📥 ОТВЕТ ОТ ROUTERAI (страница {page_number})")
        logger.info(f"   Модель: {response.model}")
        logger.info(f"   ID: {response.id}")
        logger.info(f"   Токены входящие: {response.usage.prompt_tokens if hasattr(response, 'usage') else 'N/A'}")
        logger.info(f"   Токены исходящие: {response.usage.completion_tokens if hasattr(response, 'usage') else 'N/A'}")
        logger.info(f"   Всего токенов: {response.usage.total_tokens if hasattr(response, 'usage') else 'N/A'}")
        
        if response.choices and len(response.choices) > 0:
            content = response.choices[0].message.content
            logger.info(f"   Длина ответа: {len(content) if content else 0} символов")
            logger.info(f"   Содержание (первые 500 символов):\n{content[:500] if content else 'НЕТ ТЕКСТА'}...")
            if content and len(content) > 500:
                logger.info(f"   ... (всего {len(content)} символов)")
        else:
            logger.warning("   ⚠️ Ответ не содержит choices")
        logger.info("=" * 60)
        
        # Сохраняем полный ответ в файл для отладки
        try:
            debug_dir = os.getenv("DEBUG_DIR", "./debug")
            os.makedirs(debug_dir, exist_ok=True)
            debug_file = os.path.join(debug_dir, f"routerai_response_page_{page_number}.json")
            with open(debug_file, 'w', encoding='utf-8') as f:
                # Сохраняем только сериализуемые данные
                debug_data = {
                    "model": response.model,
                    "id": response.id,
                    "choices": [
                        {
                            "message": {
                                "content": choice.message.content
                            }
                        } for choice in response.choices
                    ] if response.choices else []
                }
                if hasattr(response, 'usage'):
                    debug_data["usage"] = {
                        "prompt_tokens": response.usage.prompt_tokens,
                        "completion_tokens": response.usage.completion_tokens,
                        "total_tokens": response.usage.total_tokens
                    }
                json.dump(debug_data, f, ensure_ascii=False, indent=2)
            logger.info(f"💾 Полный ответ сохранён в {debug_file}")
        except Exception as e:
            logger.warning(f"⚠️ Не удалось сохранить отладку: {e}")
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Извлечение текста из PDF через RouterAI Vision API (постранично)"""
        logger.info(f"📄 Извлечение текста из {pdf_path} через RouterAI Vision API")
        
        # Динамическая загрузка OCR промпта
        ocr_prompt = self._load_prompt(self.ocr_prompt_path)
        if not ocr_prompt:
            ocr_prompt = "Извлеки весь текст с этой страницы документа. Сохраняй структуру."
        
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
                image_data = buf.getvalue()
                image_base64 = base64.b64encode(image_data).decode()
                
                # Логируем запрос
                self._log_routerai_request(ocr_prompt, len(image_data))
                
                # Отправляем запрос в RouterAI
                response = self.routerai_client.chat.completions.create(
                    model=self.routerai_model,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": ocr_prompt
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
                    temperature=0.1,
                    max_tokens=4096  # Добавляем лимит для ответа
                )
                
                # Логируем ответ
                self._log_routerai_response(response, page_number)
                
                page_text = response.choices[0].message.content
                full_text += f"\n--- Страница {page_number} ---\n{page_text}\n"
                
                logger.info(f"✅ Страница {page_number} обработана ({len(page_text)} символов)")
                
                # Небольшая задержка между запросами
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"❌ Ошибка обработки страницы {page_number}: {e}")
                # Логируем детали ошибки
                if hasattr(e, 'response'):
                    try:
                        error_detail = e.response.json() if hasattr(e.response, 'json') else str(e.response)
                        logger.error(f"   Детали ошибки: {error_detail}")
                    except:
                        pass
                full_text += f"\n--- Страница {page_number} (ОШИБКА) ---\n[Не удалось извлечь текст: {str(e)}]\n"
            
            page_number += 1
        
        if not full_text.strip() or len(full_text.strip()) < 100:
            raise ValueError("Не удалось извлечь текст из PDF. Возможно, документ повреждён.")
        
        logger.info(f"✅ Извлечено всего {len(full_text)} символов")
        return full_text
    
    def structure_text_with_giga(self, text: str, max_retries: int = 3) -> List[Dict[str, Any]]:
        """Структурирование текста через GigaChat Pro"""
        logger.info("🧠 Структурирование текста через GigaChat Pro...")
        
        # Динамическая загрузка промпта структурирования
        structure_prompt = self._load_prompt(self.structure_prompt_path)
        if not structure_prompt:
            structure_prompt = "Разбей текст на логические блоки. Верни JSON массив с полями title, content, keywords."
        
        # Обрезаем текст если слишком длинный
        text_for_prompt = text[:15000]
        if len(text) > 15000:
            logger.warning(f"⚠️ Текст обрезан с {len(text)} до 15000 символов")
        
        prompt = structure_prompt.replace("{text}", text_for_prompt)
        
        # Логируем запрос к GigaChat
        logger.info("=" * 60)
        logger.info("📤 ЗАПРОС К GigaChat Pro (структурирование)")
        logger.info(f"   Длина текста: {len(text_for_prompt)} символов")
        logger.info(f"   Промпт (первые 200 символов): {prompt[:200]}...")
        logger.info("=" * 60)
        
        for attempt in range(max_retries):
            try:
                response = self.giga_pro.chat(prompt)
                content = response.choices[0].message.content
                
                # Логируем ответ GigaChat
                logger.info("=" * 60)
                logger.info("📥 ОТВЕТ ОТ GigaChat Pro")
                logger.info(f"   Длина ответа: {len(content)} символов")
                logger.info(f"   Содержание (первые 500 символов):\n{content[:500]}...")
                logger.info("=" * 60)
                
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
                logger.warning(f"   Ответ: {content[:200]}...")
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
        logger.info("📝 Использую fallback-структурирование по абзацам")
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
        
        logger.info(f"✅ Fallback: создано {len(structured)} блоков")
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
            # ⭐ Декодируем имя, если оно пришло в неправильной кодировке
            try:
                # Пробуем декодировать из Latin-1 в UTF-8
                decoded_name = custom_name.encode('latin-1').decode('utf-8')
                custom_name = decoded_name
                logger.info(f"📝 Имя декодировано: {custom_name}")
            except (UnicodeEncodeError, UnicodeDecodeError):
                # Уже в UTF-8 или другая кодировка
                pass
            
            # 1. Извлечение текста через RouterAI Vision API
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
                # ⭐ Убеждаемся, что source сохраняется в UTF-8
                source_name = custom_name
                if not isinstance(source_name, str):
                    source_name = str(source_name)
                
                documents_data.append({
                    "id": f"{document_id}_{chunk['chunk_index']}",
                    "text": chunk["text"],
                    "embedding": embedding,
                    "metadata": {
                        "document_id": document_id,
                        "source": source_name,  # ⭐ UTF-8 имя
                        "title": chunk["title"],
                        "keywords": ", ".join(chunk["keywords"]),
                        "chunk_index": chunk["chunk_index"],
                        "total_chunks": len(chunks),
                        "processed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                })
            
            # Считаем количество страниц (приблизительно)
            page_count = raw_text.count("--- Страница")
            
            logger.info(f"✅ Обработка завершена: {page_count} страниц, {len(chunks)} чанков")
            
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