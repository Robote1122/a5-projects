# API Документация — Vzmakh Chat

Base URL: `http://localhost:8001/api`  
Content-Type: `application/json`

---

## Чаты

### GET `/api/chats`
Список всех чатов (отсортирован по дате обновления).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Название чата",
      "created_at": 1700000000,
      "updated_at": 1700000100,
      "last_message": "Последнее сообщение..."
    }
  ]
}
```

---

### POST `/api/chats`
Создать новый чат.

**Body (опционально):**
```json
{ "title": "Мой чат" }
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Мой чат",
    "created_at": 1700000000,
    "updated_at": 1700000000
  }
}
```

---

### GET `/api/chats/:id`
Получить чат вместе со всеми сообщениями.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Название",
    "messages": [
      {
        "id": "uuid",
        "chat_id": "uuid",
        "role": "user",
        "content": "Привет!",
        "created_at": 1700000000
      }
    ]
  }
}
```

---

### DELETE `/api/chats/:id`
Удалить чат и все его сообщения (CASCADE).

**Response:**
```json
{ "success": true, "message": "Чат удалён" }
```

---

## Сообщения

### GET `/api/chats/:id/messages`
Все сообщения чата (по дате создания ASC).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "chat_id": "uuid",
      "role": "user",
      "content": "Текст сообщения",
      "created_at": 1700000000
    }
  ]
}
```

---

### POST `/api/chats/:id/messages`
Добавить сообщение в чат.

**Body:**
```json
{
  "role": "user",
  "content": "Привет, как дела?"
}
```
> `role` — одно из: `user`, `assistant`, `system`

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "chat_id": "uuid",
    "role": "user",
    "content": "Привет, как дела?",
    "created_at": 1700000000
  }
}
```

**Автоматика:** если это первое сообщение с `role: "user"` и чат называется "Новый чат" — заголовок чата автоматически обновляется до первых 60 символов сообщения.

---

## Health Check

### GET `/api/health`
```json
{ "success": true, "status": "ok", "uptime": 3600.5 }
```

---

## Коды ошибок

| Код | Описание |
|-----|---------|
| 400 | Невалидные данные (отсутствует content, неверный role) |
| 404 | Чат не найден |
| 500 | Внутренняя ошибка сервера |

**Формат ошибки:**
```json
{ "success": false, "error": "Описание ошибки" }
```
