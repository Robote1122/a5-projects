/**
 * aiService.js
 * Клиент для взаимодействия с Python AI-сервисом
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8002';

class AIService {
  constructor() {
    this.baseUrl = AI_SERVICE_URL;
  }

  /**
   * Проверка лимитов пользователя
   */
  async checkLimit(userId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/ai/check-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      
      if (!response.ok) throw new Error('Failed to check limit');
      return await response.json();
    } catch (error) {
      console.error('[AI Service] Check limit error:', error);
      // В случае ошибки - разрешаем (fail open)
      return { allowed: true, remaining: 100 };
    }
  }

  /**
   * Отправка сообщения в AI с получением стримингового ответа
   */
  async sendMessage(chatId, message, history = []) {
    const response = await fetch(`${this.baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message: message,
        history: history
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'AI service error');
    }

    // Возвращаем ReadableStream для стриминга
    return response.body;
  }

  /**
   * Health check AI сервиса
   */
  async health() {
    try {
      const response = await fetch(`${this.baseUrl}/api/ai/health`);
      return await response.json();
    } catch {
      return { status: 'unavailable' };
    }
  }
}

module.exports = new AIService();