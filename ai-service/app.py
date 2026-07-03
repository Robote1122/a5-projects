from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
from pathlib import Path
import shutil
import json
import os
from rag_engine import RAGEngine

app = FastAPI()
rag = RAGEngine()


class ChatRequest(BaseModel):
    chat_id: str
    message: str
    history: list = []  # последние N сообщений для контекста

class CheckLimitRequest(BaseModel):
    user_id: str

# Модель для обновления промпта
class PromptUpdateRequest(BaseModel):
    prompt_type: str  # "start" или "continue"
    content: str

# Эндпоинт для проверки лимитов
@app.post("/api/ai/check-limit")
async def check_limit(request: CheckLimitRequest):
    # Пока всегда True, но структура готова для будущих лимитов
    return {
        "allowed": True,
        "remaining": 100,  # для будущего использования
        "reset_at": None
    }

# Эндпоинт для генерации ответа (со стримингом)
@app.post("/api/ai/chat")
async def chat(request: ChatRequest):
    try:
        # Получаем контекст из векторной БД
        context = rag.search(request.message, n_results=3)
        
        # Генерируем ответ со стримингом
        async def generate():
            async for chunk in rag.generate_response(
                query=request.message,
                context=context,
                history=request.history
            ):
                yield f"data: {json.dumps({'content': chunk, 'done': False}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
# Эндпоинт для получения текущего промпта
@app.get("/api/ai/prompt/{prompt_type}")
async def get_prompt(prompt_type: str):
    """
    Получить содержимое prompt-файла
    prompt_type: start или continue
    """
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

# Эндпоинт для обновления промпта через текст
@app.post("/api/ai/prompt/{prompt_type}")
async def update_prompt_text(prompt_type: str, request: PromptUpdateRequest):
    """
    Обновить содержимое prompt-файла через текст
    """
    if prompt_type not in ["start", "continue"]:
        raise HTTPException(status_code=400, detail="prompt_type должен быть 'start' или 'continue'")
    
    try:
        file_path = rag.prompt_start_path if prompt_type == "start" else rag.prompt_continue_path
        
        # Создаем бэкап
        backup_path = f"{file_path}.backup"
        if os.path.exists(file_path):
            shutil.copy2(file_path, backup_path)
        
        # Записываем новый контент
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

# Эндпоинт для загрузки файла промпта
@app.post("/api/ai/prompt/{prompt_type}/upload")
async def upload_prompt_file(
    prompt_type: str,
    file: UploadFile = File(...)
):
    """
    Загрузить новый файл промпта (.txt)
    """
    if prompt_type not in ["start", "continue"]:
        raise HTTPException(status_code=400, detail="prompt_type должен быть 'start' или 'continue'")
    
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате .txt")
    
    try:
        file_path = rag.prompt_start_path if prompt_type == "start" else rag.prompt_continue_path
        
        # Создаем бэкап
        backup_path = f"{file_path}.backup"
        if os.path.exists(file_path):
            shutil.copy2(file_path, backup_path)
        
        # Сохраняем новый файл
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

# Эндпоинт для восстановления бэкапа
@app.post("/api/ai/prompt/{prompt_type}/restore")
async def restore_prompt_backup(prompt_type: str):
    """
    Восстановить промпт из бэкапа
    """
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

# Health check
@app.get("/api/ai/health")
async def health():
    return {"status": "ok", "db_count": rag.get_collection_count()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)