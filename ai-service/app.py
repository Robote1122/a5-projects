from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import json
from rag_engine import RAGEngine

app = FastAPI()
rag = RAGEngine()

class ChatRequest(BaseModel):
    chat_id: str
    message: str
    history: list = []  # последние N сообщений для контекста

class CheckLimitRequest(BaseModel):
    user_id: str

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

# Health check
@app.get("/api/ai/health")
async def health():
    return {"status": "ok", "db_count": rag.get_collection_count()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)