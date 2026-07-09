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
import re
from services.model_manager import model_manager

logger = logging.getLogger(__name__)

class PDFProcessor:
    """Обработчик PDF с извлечением текста через RouterAI Vision API и структурированием через GigaChat Pro"""
    
    def __init__(self):
        self.gigachat_auth = os.getenv("GIGACHAT_AUTH_DATA")
        
        # Загрузка промптов
        self.ocr_prompt_path = os.getenv("OCR_PROMPT_PATH", "./prompts/ocr_prompt.txt")
        self.structure_prompt_path = os.getenv("STRUCTURE_PROMPT_PATH", "./prompts/structure_prompt.txt")
        
        # Настройки RouterAI
        self.routerai_api_key = os.getenv("ROUTERAI_API_KEY")
        self.routerai_base_url = os.getenv("ROUTERAI_BASE_URL", "https://routerai.ru/api/v1")
        self.routerai_model = os.getenv("ROUTERAI_MODEL", "meta-llama/llama-3.2-11b-vision-instruct")
        self.dpi = int(os.getenv("OCR_DPI", 200))
        
        # Настройки чанкинга
        self.chunk_size = int(os.getenv("CHUNK_SIZE", 500))
        self.chunk_overlap = int(os.getenv("CHUNK_OVERLAP", 100))
        
        # Настройки для структурирования с контекстом
        self.max_chars_per_part = int(os.getenv("MAX_CHARS_PER_PART", 12000))
        self.context_overlap = int(os.getenv("CONTEXT_OVERLAP", 3000))
        self.max_blocks_per_part = int(os.getenv("MAX_BLOCKS_PER_PART", 30))
        
        # Инициализируем RouterAI клиент
        self._init_routerai()
        
        logger.info("✅ PDFProcessor инициализирован")
        logger.info(f"   Текущая модель GigaChat: {model_manager.get_current_model()}")
        logger.info(f"   Макс. символов на часть: {self.max_chars_per_part}")
        logger.info(f"   Перекрытие: {self.context_overlap}")

    def _init_routerai(self):
        """Инициализация RouterAI клиента"""
        from openai import OpenAI
        
        if not self.routerai_api_key:
            raise ValueError("ROUTERAI_API_KEY не задан в .env")
        
        self.routerai_client = OpenAI(
            api_key=self.routerai_api_key,
            base_url=self.routerai_base_url
        )
        logger.info(f"✅ RouterAI клиент инициализирован (модель: {self.routerai_model})")
        logger.info(f"📍 RouterAI Base URL: {self.routerai_base_url}")
    
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
        
        if hasattr(response, 'usage'):
            logger.info(f"   Токены входящие: {response.usage.prompt_tokens}")
            logger.info(f"   Токены исходящие: {response.usage.completion_tokens}")
            logger.info(f"   Всего токенов: {response.usage.total_tokens}")
        else:
            logger.info("   Токены: N/A")
        
        if response.choices and len(response.choices) > 0:
            content = response.choices[0].message.content
            content_len = len(content) if content else 0
            logger.info(f"   Длина ответа: {content_len} символов")
            if content:
                logger.info(f"   Содержание (первые 500 символов):\n{content[:500]}...")
                if len(content) > 500:
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
        
        ocr_prompt = self._load_prompt(self.ocr_prompt_path)
        if not ocr_prompt:
            ocr_prompt = "Извлеки весь текст с этой страницы документа. Сохраняй структуру."
        
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
                buf = io.BytesIO()
                page.save(buf, format="PNG")
                image_data = buf.getvalue()
                image_base64 = base64.b64encode(image_data).decode()
                
                self._log_routerai_request(ocr_prompt, len(image_data))
                
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
                    max_tokens=4096
                )
                
                self._log_routerai_response(response, page_number)
                
                page_text = response.choices[0].message.content
                full_text += f"\n--- Страница {page_number} ---\n{page_text}\n"
                
                logger.info(f"✅ Страница {page_number} обработана ({len(page_text)} символов)")
                time.sleep(0.5)
                
            except Exception as e:
                logger.error(f"❌ Ошибка обработки страницы {page_number}: {e}")
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
    
    def _structure_with_prompt_raw(self, prompt: str, max_retries: int) -> List[Dict[str, Any]]:
        """Структурирование с готовым промптом"""
        giga_chat = model_manager.get_chat_client()
        
        for attempt in range(max_retries):
            try:
                response = giga_chat.chat(prompt)
                content = response.choices[0].message.content
                
                content = content.strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
                
                structured_data = json.loads(content)
                
                if not isinstance(structured_data, list):
                    raise ValueError("Ожидался массив объектов")
                
                return structured_data
                
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ Ошибка парсинга JSON (попытка {attempt+1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                else:
                    return []
                    
            except Exception as e:
                logger.error(f"❌ Ошибка структурирования: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                else:
                    raise
    
    def _deduplicate_blocks(self, blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Удаление дубликатов блоков"""
        seen_titles = set()
        seen_contents = set()
        unique_blocks = []
        
        for block in blocks:
            title = block.get("title", "")
            content = block.get("content", "")
            
            # Безопасное создание хэша
            content_short = content[:200]
            content_hash = hashlib.md5(content_short.encode('utf-8', errors='ignore')).hexdigest()
            
            if title and title not in seen_titles and content_hash not in seen_contents:
                seen_titles.add(title)
                seen_contents.add(content_hash)
                unique_blocks.append(block)
        
        return unique_blocks
    
    def _split_text_into_parts(self, text: str) -> List[Dict[str, Any]]:
        """Разбивает текст на части с перекрытием для сохранения контекста"""
        if len(text) <= self.max_chars_per_part:
            return [{'text': text, 'start': 0, 'end': len(text)}]
        
        logger.info(f"📄 Текст большой ({len(text)} символов), разбиваем с перекрытием")
        
        parts = []
        start = 0
        
        while start < len(text):
            end = min(start + self.max_chars_per_part, len(text))
            part = text[start:end]
            parts.append({
                'text': part,
                'start': start,
                'end': end
            })
            start = end - self.context_overlap if end < len(text) else end
        
        logger.info(f"📦 Разбито на {len(parts)} частей с перекрытием {self.context_overlap} символов")
        return parts
    
    def structure_text_with_giga(self, text: str, max_retries: int = 3) -> List[Dict[str, Any]]:
        """Структурирование текста с контекстным окном"""
        logger.info("🧠 Структурирование текста через GigaChat с контекстом...")
        
        current_model = model_manager.get_current_model()
        logger.info(f"   Используется модель: {current_model}")
        
        structure_prompt = self._load_prompt(self.structure_prompt_path)
        if not structure_prompt:
            structure_prompt = "Разбей текст на логические блоки. Верни JSON массив с полями title, content, keywords."
        
        # Если текст маленький - обрабатываем целиком
        if len(text) <= self.max_chars_per_part:
            logger.info(f"📄 Текст {len(text)} символов, обрабатываем целиком")
            prompt = structure_prompt.replace("{text}", text)
            return self._structure_with_prompt_raw(prompt, max_retries)
        
        # Разбиваем на части с перекрытием
        parts = self._split_text_into_parts(text)
        
        all_blocks = []
        previous_blocks = []
        seen_titles = set()
        seen_contents = set()
        total_parts = len(parts)
        
        for i, part_info in enumerate(parts):
            part_num = i + 1
            logger.info(f"🔄 Часть {part_num}/{total_parts} ({len(part_info['text'])} символов)")
            
            # Формируем контекст из предыдущих блоков
            context_text = ""
            if previous_blocks:
                context_blocks = previous_blocks[-5:]
                context_lines = []
                for b in context_blocks:
                    title = b.get('title', '')
                    content = b.get('content', '')[:300]
                    context_lines.append(f"ПРЕДЫДУЩИЙ БЛОК (для контекста):\nЗаголовок: {title}\nСодержание: {content}...")
                context_text = "\n\n".join(context_lines)
                logger.info(f"   📚 Контекст: {len(context_blocks)} предыдущих блоков")
            
            # Формируем промпт с контекстом
            context_part = ""
            if context_text:
                context_part = f"КОНТЕКСТ ПРЕДЫДУЩЕЙ ЧАСТИ:\n{context_text}\n"
            
            prompt_with_context = structure_prompt + f"""

⚠️ ВАЖНО: Это ЧАСТЬ {part_num} из {total_parts} большого документа.

{context_part}

ТЕКСТ ДЛЯ СТРУКТУРИРОВАНИЯ (часть {part_num}/{total_parts}):
{part_info['text']}

ИНСТРУКЦИИ:
1. Продолжи структурирование с учетом контекста выше
2. Если блок уже был в контексте - НЕ дублируй его
3. Сохраняй логическую связь между частями
4. Если есть ссылки на предыдущие части - сохраняй их
5. Верни ТОЛЬКО JSON-массив с новыми блоками
"""
            
            try:
                blocks = self._structure_with_prompt_raw(prompt_with_context, max_retries)
                
                if not blocks:
                    logger.warning(f"   ⚠️ Часть {part_num} не дала блоков")
                    continue
                
                # Фильтруем дубликаты
                new_blocks = []
                for block in blocks:
                    title = block.get("title", "")
                    content = block.get("content", "")
                    content_short = content[:200]
                    content_hash = hashlib.md5(content_short.encode('utf-8', errors='ignore')).hexdigest()
                    
                    if title and title not in seen_titles and content_hash not in seen_contents:
                        seen_titles.add(title)
                        seen_contents.add(content_hash)
                        new_blocks.append(block)
                
                logger.info(f"   ✅ Получено {len(blocks)} блоков, добавлено {len(new_blocks)} новых")
                all_blocks.extend(new_blocks)
                
                # Сохраняем блоки для контекста следующей части
                previous_blocks = blocks[-10:] if blocks else previous_blocks
                
                # Проверяем лимит
                if len(all_blocks) > 200:
                    logger.warning(f"⚠️ Достигнут лимит блоков ({len(all_blocks)}), останавливаем")
                    break
                    
            except Exception as e:
                logger.error(f"   ❌ Ошибка части {part_num}: {e}")
                continue
        
        # Если ничего не получилось - fallback
        if not all_blocks:
            logger.warning("⚠️ Не удалось структурировать части, используем fallback")
            return self._fallback_structure(text)
        
        logger.info(f"✅ Всего структурировано {len(all_blocks)} уникальных блоков из {total_parts} частей")
        return all_blocks
    
    def _fallback_structure(self, text: str) -> List[Dict[str, Any]]:
        """Fallback-структурирование текста по абзацам"""
        logger.info("📝 Использую fallback-структурирование по абзацам")
        
        # Если текст слишком большой - обрезаем для fallback
        if len(text) > 15000:
            text = text[:15000]
            logger.info(f"   Текст обрезан до 15000 символов для fallback")
        
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
        stop_words = {'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'за', 'под', 'над', 'о', 'об', 'при', 'без', 'или', 'но', 'да', 'не', 'ни', 'как', 'так', 'же', 'если', 'то'}
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
        """Генерация эмбеддингов с разбивкой на маленькие части"""
        logger.info(f"🧠 Генерация эмбеддингов для {len(texts)} текстов...")
        
        giga_embed = model_manager.get_embed_client()
        
        # Безопасный лимит для эмбеддингов (514 токенов ≈ 2000 символов)
        MAX_CHARS_FOR_EMBEDDING = 1500
        
        embeddings = []
        failed_count = 0
        
        for i, text in enumerate(texts):
            try:
                # Если текст короткий - отправляем как есть
                if len(text) <= MAX_CHARS_FOR_EMBEDDING:
                    response = giga_embed.embeddings([text])
                    embeddings.append(response.data[0].embedding)
                    logger.info(f"✅ Эмбеддинг {i+1}/{len(texts)} получен")
                    continue
                
                # Текст длинный - разбиваем
                logger.warning(f"⚠️ Текст {i+1} длинный ({len(text)} символов), разбиваем...")
                
                # Разбиваем по предложениям
                sentences = re.split(r'[.!?]+', text)
                chunks = []
                current = ""
                
                for sent in sentences:
                    sent = sent.strip()
                    if not sent:
                        continue
                    if len(current) + len(sent) < MAX_CHARS_FOR_EMBEDDING:
                        current += sent + ". "
                    else:
                        if current:
                            chunks.append(current.strip())
                        current = sent + ". "
                
                if current:
                    chunks.append(current.strip())
                
                # Генерируем эмбеддинг для каждого чанка
                chunk_vectors = []
                for chunk in chunks:
                    try:
                        if len(chunk) > MAX_CHARS_FOR_EMBEDDING:
                            chunk = chunk[:MAX_CHARS_FOR_EMBEDDING]
                        response = giga_embed.embeddings([chunk])
                        chunk_vectors.append(response.data[0].embedding)
                    except Exception as e:
                        logger.warning(f"   ⚠️ Ошибка чанка: {e}")
                        continue
                
                # Усредняем векторы
                if chunk_vectors:
                    avg = [sum(x) / len(chunk_vectors) for x in zip(*chunk_vectors)]
                    embeddings.append(avg)
                    logger.info(f"   ✅ Усреднённый эмбеддинг из {len(chunk_vectors)} частей")
                else:
                    embeddings.append([0.0] * 1024)
                    failed_count += 1
                    logger.warning(f"   ⚠️ Использован нулевой вектор")
                    
            except Exception as e:
                logger.error(f"❌ Ошибка для текста {i+1}: {e}")
                embeddings.append([0.0] * 1024)
                failed_count += 1
        
        if failed_count > 0:
            logger.warning(f"⚠️ {failed_count} текстов получили нулевые векторы")
        
        logger.info(f"✅ Всего сгенерировано {len(embeddings)} эмбеддингов")
        return embeddings
    
    def process_pdf(self, pdf_path: str, custom_name: str, document_id: str) -> Dict[str, Any]:
        """Полный цикл обработки PDF"""
        logger.info(f"🔄 Обработка PDF: {custom_name} (ID: {document_id})")
        
        try:
            # Декодируем имя
            try:
                decoded_name = custom_name.encode('latin-1').decode('utf-8')
                custom_name = decoded_name
                logger.info(f"📝 Имя декодировано: {custom_name}")
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
            
            # 1. Извлечение текста через RouterAI Vision API
            raw_text = self.extract_text_from_pdf(pdf_path)
            logger.info(f"📄 Извлечено {len(raw_text)} символов текста")
            
            # 2. Структурирование через GigaChat с контекстом
            structured_data = self.structure_text_with_giga(raw_text)
            
            # 3. Дедупликация блоков
            structured_data = self._deduplicate_blocks(structured_data)
            logger.info(f"📊 После дедупликации: {len(structured_data)} блоков")
            
            # 4. Чанкинг
            chunks = self.chunk_text(structured_data)
            
            if not chunks:
                raise ValueError("Не удалось создать чанки из документа")
            
            # 5. Генерация эмбеддингов
            chunk_texts = [chunk["text"] for chunk in chunks]
            embeddings = self.generate_embeddings(chunk_texts)
            
            # 6. Подготовка данных для ChromaDB
            documents_data = []
            for chunk, embedding in zip(chunks, embeddings):
                source_name = custom_name
                if not isinstance(source_name, str):
                    source_name = str(source_name)
                
                documents_data.append({
                    "id": f"{document_id}_{chunk['chunk_index']}",
                    "text": chunk["text"],
                    "embedding": embedding,
                    "metadata": {
                        "document_id": document_id,
                        "source": source_name,
                        "title": chunk["title"],
                        "keywords": ", ".join(chunk["keywords"]),
                        "chunk_index": chunk["chunk_index"],
                        "total_chunks": len(chunks),
                        "processed_at": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                })
            
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
            import traceback
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "document_id": document_id,
                "source": custom_name,
                "error": str(e)
            }