# ai-service/app.py
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
from pathlib import Path
import shutil
import json
import os
import logging

from rag_engine import RAGEngine
from routers import documents

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Vzmakh Chat AI Service")

# Подключаем роутеры
app.include_router(documents.router)

# Инициализация RAG
rag = RAGEngine()


# Модели данных
class ChatRequest(BaseModel):
    chat_id: str
    message: str
    history: list = []


class CheckLimitRequest(BaseModel):
    user_id: str


class PromptUpdateRequest(BaseModel):
    prompt_type: str
    content: str


# ============================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ПРОМПТАМИ
# ============================================

def get_prompt_path(prompt_type: str) -> str:
    """Получение пути к файлу промпта по его типу"""
    prompt_paths = {
        "start": os.getenv("PROMPT_1_PATH", "./prompts/chat_start.txt"),
        "continue": os.getenv("PROMPT_2_PATH", "./prompts/chat_continue.txt"),
        "ocr": os.getenv("OCR_PROMPT_PATH", "./prompts/ocr_prompt.txt"),
        "structure": os.getenv("STRUCTURE_PROMPT_PATH", "./prompts/structure_prompt.txt"),
    }
    
    path = prompt_paths.get(prompt_type)
    if not path:
        raise HTTPException(
            status_code=400, 
            detail=f"Неизвестный тип промпта: {prompt_type}. Доступные: start, continue, ocr, structure"
        )
    return path


def get_prompt_metadata(prompt_type: str) -> dict:
    """Получение метаданных промпта"""
    metadata = {
        "start": {
            "display_name": "Начальный промпт (без контекста)",
            "filename": "chat_start.txt",
            "description": "Используется, когда нет контекста из базы знаний"
        },
        "continue": {
            "display_name": "Промпт с контекстом",
            "filename": "chat_continue.txt",
            "description": "Используется, когда есть контекст из базы знаний"
        },
        "ocr": {
            "display_name": "OCR промпт",
            "filename": "ocr_prompt.txt",
            "description": "Используется для извлечения текста из изображений PDF"
        },
        "structure": {
            "display_name": "Промпт структурирования",
            "filename": "structure_prompt.txt",
            "description": "Используется для структурирования извлечённого текста"
        }
    }
    return metadata.get(prompt_type, {})


# ============================================
# ЭНДПОИНТЫ
# ============================================

@app.post("/api/ai/check-limit")
async def check_limit(request: CheckLimitRequest):
    return {
        "allowed": True,
        "remaining": 100,
        "reset_at": None
    }


@app.post("/api/ai/chat")
async def chat(request: ChatRequest):
    try:
        # Получаем контекст из векторной БД
        context = rag.search(request.message, n_results=3)
        
        # Форматируем контекст с источниками
        context_with_sources = []
        for item in context:
            context_with_sources.append({
                "content": item["content"],
                "source": item.get("source", "Неизвестный источник"),
                "relevance": item.get("relevance", 0)
            })
        
        # Генерируем ответ со стримингом
        async def generate():
            async for chunk in rag.generate_response(
                query=request.message,
                context=context_with_sources,
                history=request.history
            ):
                yield f"data: {json.dumps({'content': chunk, 'done': False}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# ЭНДПОИНТЫ ДЛЯ РАБОТЫ С ПРОМПТАМИ (ВСЕ 4 ТИПА)
# ============================================

@app.get("/api/ai/prompt/{prompt_type}")
async def get_prompt(prompt_type: str):
    """Получение содержимого промпта"""
    try:
        file_path = get_prompt_path(prompt_type)
        metadata = get_prompt_metadata(prompt_type)
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "success": True,
            "prompt_type": prompt_type,
            "display_name": metadata.get("display_name", prompt_type),
            "filename": metadata.get("filename", f"{prompt_type}.txt"),
            "description": metadata.get("description", ""),
            "content": content
        }
    except FileNotFoundError:
        # Если файл не найден, возвращаем пустой контент
        logger.warning(f"⚠️ Файл промпта не найден: {file_path}")
        return {
            "success": True,
            "prompt_type": prompt_type,
            "display_name": metadata.get("display_name", prompt_type),
            "filename": metadata.get("filename", f"{prompt_type}.txt"),
            "description": metadata.get("description", ""),
            "content": ""
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/prompt/{prompt_type}")
async def update_prompt_text(prompt_type: str, request: PromptUpdateRequest):
    """Обновление промпта через текст"""
    try:
        file_path = get_prompt_path(prompt_type)
        metadata = get_prompt_metadata(prompt_type)
        
        # Создаём бэкап
        backup_path = f"{file_path}.backup"
        if os.path.exists(file_path):
            shutil.copy2(file_path, backup_path)
        
        # Записываем новый контент
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(request.content)
        
        return {
            "success": True,
            "message": f"Файл {metadata.get('filename', prompt_type)} обновлен",
            "prompt_type": prompt_type,
            "display_name": metadata.get("display_name", prompt_type),
            "backup_created": os.path.exists(backup_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/prompt/{prompt_type}/upload")
async def upload_prompt_file(prompt_type: str, file: UploadFile = File(...)):
    """Загрузка файла промпта (.txt)"""
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате .txt")
    
    try:
        file_path = get_prompt_path(prompt_type)
        metadata = get_prompt_metadata(prompt_type)
        
        # Создаём бэкап
        backup_path = f"{file_path}.backup"
        if os.path.exists(file_path):
            shutil.copy2(file_path, backup_path)
        
        # Сохраняем новый файл
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        return {
            "success": True,
            "message": f"Файл {metadata.get('filename', prompt_type)} обновлен через загрузку",
            "prompt_type": prompt_type,
            "display_name": metadata.get("display_name", prompt_type),
            "filename": file.filename,
            "backup_created": os.path.exists(backup_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/prompt/{prompt_type}/restore")
async def restore_prompt_backup(prompt_type: str):
    """Восстановление промпта из бэкапа"""
    try:
        file_path = get_prompt_path(prompt_type)
        metadata = get_prompt_metadata(prompt_type)
        backup_path = f"{file_path}.backup"
        
        if not os.path.exists(backup_path):
            raise HTTPException(status_code=404, detail="Бэкап не найден")
        
        shutil.copy2(backup_path, file_path)
        
        return {
            "success": True,
            "message": f"Файл {metadata.get('filename', prompt_type)} восстановлен из бэкапа"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/prompt-types")
async def get_prompt_types():
    """Получение списка всех доступных типов промптов"""
    return {
        "success": True,
        "types": [
            {
                "value": "start",
                "display_name": "Начальный промпт (без контекста)",
                "filename": "chat_start.txt",
                "description": "Используется, когда нет контекста из базы знаний"
            },
            {
                "value": "continue",
                "display_name": "Промпт с контекстом",
                "filename": "chat_continue.txt",
                "description": "Используется, когда есть контекст из базы знаний"
            },
            {
                "value": "ocr",
                "display_name": "OCR промпт",
                "filename": "ocr_prompt.txt",
                "description": "Используется для извлечения текста из изображений PDF"
            },
            {
                "value": "structure",
                "display_name": "Промпт структурирования",
                "filename": "structure_prompt.txt",
                "description": "Используется для структурирования извлечённого текста"
            }
        ]
    }


# ============================================
# HEALTH CHECK
# ============================================

@app.get("/api/ai/health")
async def health():
    from services.document_storage import DocumentStorage
    doc_storage = DocumentStorage()
    return {
        "status": "ok",
        "db_count": rag.get_collection_count(),
        "total_sources": len(doc_storage.get_all_sources())
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)