# ai-service/routers/settings.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.model_manager import model_manager
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai/settings", tags=["settings"])

class SettingsUpdate(BaseModel):
    key: str
    value: str

@router.post("/update")
async def update_settings(settings: SettingsUpdate):
    """Обновляет настройки и перезагружает модели"""
    try:
        logger.info(f"📥 Получен запрос на обновление: {settings.key} = {settings.value}")
        
        if settings.key in ['gigachat_model', 'gigachat_embed_model']:
            # Перезагружаем настройки
            success = model_manager.reload()
            if success:
                return {
                    "success": True,
                    "message": f"Модель обновлена на {model_manager.get_current_model()}",
                    "current_model": model_manager.get_current_model()
                }
            else:
                raise HTTPException(status_code=500, detail="Ошибка перезагрузки модели")
        
        return {"success": True, "message": "Настройка обновлена"}
        
    except Exception as e:
        logger.error(f"❌ Ошибка обновления настроек: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/models")
async def get_available_models():
    """Возвращает список доступных моделей"""
    return {
        "success": True,
        "current_model": model_manager.get_current_model(),
        "available_models": model_manager.get_available_models()
    }

@router.get("/status")
async def get_status():
    """Возвращает текущий статус менеджера моделей"""
    return {
        "success": True,
        "current_model": model_manager.get_current_model(),
        "embed_model": model_manager.current_embed_model,
        "available_models": model_manager.get_available_models()
    }