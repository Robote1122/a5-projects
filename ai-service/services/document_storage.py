# ai-service/services/document_storage.py
import chromadb
import logging
from typing import List, Dict, Any, Optional
from chromadb.config import Settings
import os

logger = logging.getLogger(__name__)

class DocumentStorage:
    """Сервис для управления документами в ChromaDB"""
    
    def __init__(self):
        self.db_path = os.getenv("DB_PATH", "./safety_checklist_db")
        self.collection_name = os.getenv("COLLECTION_NAME", "safety_checklists")
        
        logger.info(f"🔗 Подключение к ChromaDB: {self.db_path}")
        self.client = chromadb.PersistentClient(
            path=self.db_path,
            settings=Settings(anonymized_telemetry=False)
        )
        
        try:
            self.collection = self.client.get_collection(self.collection_name)
            logger.info(f"✅ Коллекция найдена. Документов: {self.collection.count()}")
        except:
            logger.info("📦 Создание новой коллекции...")
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"description": "База знаний с документами"}
            )
            logger.info("✅ Коллекция создана")
    
    def add_documents(self, documents_data: List[Dict[str, Any]]) -> int:
        """Добавление документов в ChromaDB"""
        if not documents_data:
            return 0
        
        try:
            ids = [doc["id"] for doc in documents_data]
            texts = [doc["text"] for doc in documents_data]
            embeddings = [doc["embedding"] for doc in documents_data]
            metadatas = [doc["metadata"] for doc in documents_data]
            
            self.collection.add(
                ids=ids,
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas
            )
            
            logger.info(f"✅ Добавлено {len(documents_data)} документов в ChromaDB")
            return len(documents_data)
            
        except Exception as e:
            logger.error(f"❌ Ошибка добавления в ChromaDB: {e}")
            raise
    
    def delete_documents(self, document_id: str) -> int:
        """Удаление всех чанков документа по document_id"""
        try:
            results = self.collection.get(
                where={"document_id": document_id}
            )
            
            if results and results['ids']:
                self.collection.delete(ids=results['ids'])
                deleted_count = len(results['ids'])
                logger.info(f"🗑️ Удалено {deleted_count} чанков документа {document_id}")
                return deleted_count
            else:
                logger.info(f"ℹ️ Документ {document_id} не найден в ChromaDB")
                return 0
                
        except Exception as e:
            logger.error(f"❌ Ошибка удаления из ChromaDB: {e}")
            raise
    
    def get_document_chunks(self, document_id: str) -> List[Dict[str, Any]]:
        """Получение всех чанков документа"""
        try:
            results = self.collection.get(
                where={"document_id": document_id},
                include=["documents", "metadatas"]
            )
            
            chunks = []
            if results and results['ids']:
                for i, doc_id in enumerate(results['ids']):
                    chunks.append({
                        "id": doc_id,
                        "text": results['documents'][i],
                        "metadata": results['metadatas'][i]
                    })
            
            return chunks
            
        except Exception as e:
            logger.error(f"❌ Ошибка получения чанков: {e}")
            return []
    
    def get_all_sources(self) -> List[str]:
        """Получение списка всех источников"""
        try:
            results = self.collection.get(
                include=["metadatas"]
            )
            
            sources = set()
            if results and results['metadatas']:
                for meta in results['metadatas']:
                    if 'source' in meta:
                        sources.add(meta['source'])
            
            return sorted(list(sources))
            
        except Exception as e:
            logger.error(f"❌ Ошибка получения источников: {e}")
            return []
    
    def get_collection_count(self) -> int:
        """Количество документов в коллекции"""
        try:
            return self.collection.count()
        except:
            return 0