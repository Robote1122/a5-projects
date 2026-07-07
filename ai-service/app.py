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


# Эндпоинты
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


@app.get("/api/ai/prompt/{prompt_type}")
async def get_prompt(prompt_type: str):
    if prompt_type not in ["start", "continue"]:
        raise HTTPException(status_code=400, detail="prompt_type должен быть 'start' или 'continue'")
    
    try:
        file_path = rag.prompt_start_path if prompt_type == "start" else rag.prompt_continue_path
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {
            "success": True,
            "prompt_type": prompt_type,
            "content": content
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Файл {prompt_type}.txt не найден")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/prompt/{prompt_type}")
async def update_prompt_text(prompt_type: str, request: PromptUpdateRequest):
    if prompt_type not in ["start", "continue"]:
        raise HTTPException(status_code=400, detail="prompt_type должен быть 'start' или 'continue'")
    
    try:
        file_path = rag.prompt_start_path if prompt_type == "start" else rag.prompt_continue_path
        backup_path = f"{file_path}.backup"
        if os.path.exists(file_path):
            shutil.copy2(file_path, backup_path)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(request.content)
        
        return {
            "success": True,
            "message": f"Файл {prompt_type}.txt обновлен",
            "prompt_type": prompt_type,
            "backup_created": os.path.exists(backup_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/prompt/{prompt_type}/upload")
async def upload_prompt_file(prompt_type: str, file: UploadFile = File(...)):
    if prompt_type not in ["start", "continue"]:
        raise HTTPException(status_code=400, detail="prompt_type должен быть 'start' или 'continue'")
    
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате .txt")
    
    try:
        file_path = rag.prompt_start_path if prompt_type == "start" else rag.prompt_continue_path
        backup_path = f"{file_path}.backup"
        if os.path.exists(file_path):
            shutil.copy2(file_path, backup_path)
        
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        return {
            "success": True,
            "message": f"Файл {prompt_type}.txt обновлен через загрузку",
            "prompt_type": prompt_type,
            "filename": file.filename,
            "backup_created": os.path.exists(backup_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/prompt/{prompt_type}/restore")
async def restore_prompt_backup(prompt_type: str):
    if prompt_type not in ["start", "continue"]:
        raise HTTPException(status_code=400, detail="prompt_type должен быть 'start' или 'continue'")
    
    try:
        file_path = rag.prompt_start_path if prompt_type == "start" else rag.prompt_continue_path
        backup_path = f"{file_path}.backup"
        
        if not os.path.exists(backup_path):
            raise HTTPException(status_code=404, detail="Бэкап не найден")
        
        shutil.copy2(backup_path, file_path)
        
        return {
            "success": True,
            "message": f"Файл {prompt_type}.txt восстановлен из бэкапа"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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