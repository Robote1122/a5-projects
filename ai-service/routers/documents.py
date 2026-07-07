# ai-service/routers/documents.py
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from typing import List, Optional
import os
import shutil
import logging
from pathlib import Path

from services.pdf_processor import PDFProcessor
from services.document_storage import DocumentStorage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai/documents", tags=["documents"])

# Инициализация сервисов
pdf_processor = PDFProcessor()
doc_storage = DocumentStorage()

TEMP_DIR = os.getenv("TEMP_DIR", "./temp_uploads")
os.makedirs(TEMP_DIR, exist_ok=True)


@router.post("/process")
async def process_document(
    document_id: str = Form(...),
    custom_name: str = Form(...),
    file: UploadFile = File(...)
):
    """Обработка загруженного PDF документа"""
    # Корректно декодируем имя в UTF-8
    try:
        decoded_name = custom_name.encode('latin-1').decode('utf-8')
    except:
        decoded_name = custom_name
    custom_name=decoded_name
    logger.info(f"📥 Получен запрос на обработку: {custom_name} (ID: {document_id})")
    
    temp_file_path = os.path.join(TEMP_DIR, f"{document_id}.pdf")
    
    try:
        # Сохраняем загруженный файл
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Обрабатываем PDF
        result = pdf_processor.process_pdf(
            pdf_path=temp_file_path,
            custom_name=custom_name,
            document_id=document_id
        )
        
        if not result["success"]:
            raise HTTPException(status_code=500, detail=result.get("error", "Ошибка обработки"))
        
        # Сохраняем в ChromaDB
        chunks_added = doc_storage.add_documents(result["chunks"])
        
        return {
            "success": True,
            "document_id": document_id,
            "custom_name": custom_name,
            "page_count": result.get("pages", 0),
            "chunk_count": chunks_added,
            "total_chunks": result.get("total_chunks", 0)
        }
        
    except Exception as e:
        logger.error(f"❌ Ошибка обработки: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        except:
            pass


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """Удаление документа из ChromaDB"""
    try:
        deleted = doc_storage.delete_documents(document_id)
        return {
            "success": True,
            "document_id": document_id,
            "deleted_chunks": deleted
        }
    except Exception as e:
        logger.error(f"❌ Ошибка удаления: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{document_id}/chunks")
async def get_document_chunks(document_id: str):
    """Получение всех чанков документа"""
    try:
        chunks = doc_storage.get_document_chunks(document_id)
        return {
            "success": True,
            "document_id": document_id,
            "chunks": chunks,
            "total": len(chunks)
        }
    except Exception as e:
        logger.error(f"❌ Ошибка получения чанков: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sources")
async def get_all_sources():
    """Получение списка всех источников в базе знаний"""
    try:
        sources = doc_storage.get_all_sources()
        return {
            "success": True,
            "sources": sources,
            "total": len(sources)
        }
    except Exception as e:
        logger.error(f"❌ Ошибка получения источников: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats():
    """Статистика базы знаний"""
    try:
        count = doc_storage.get_collection_count()
        sources = doc_storage.get_all_sources()
        return {
            "success": True,
            "total_chunks": count,
            "total_sources": len(sources),
            "sources": sources
        }
    except Exception as e:
        logger.error(f"❌ Ошибка получения статистики: {e}")
        raise HTTPException(status_code=500, detail=str(e))