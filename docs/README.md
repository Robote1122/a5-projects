# Vzmakh Chat — Документация

Полное веб-приложение чата. Node.js + Express бэкенд, React фронтенд, SQLite хранилище.  
Домен: **vzmakh.su** | Порт: **8001**

---

## Структура проекта

```
vzmakh-chat/
├── server/                     # Backend (Node.js + Express)
│   ├── index.js                # Точка входа, Express приложение
│   ├── db.js                   # Подключение к SQLite (singleton)
│   ├── routes/
│   │   └── chats.js            # REST API маршруты
│   ├── services/
│   │   └── aiService.js # Клиент для Python AI сервиса
│   ├── middleware/
│   │   └── errorHandler.js     # Глобальный обработчик ошибок
│   ├── scripts/
│   │   └── init-db.js          # Скрипт инициализации БД
│   ├── data/
│   │   └── chat.db             # SQLite база данных (создаётся автоматически)
│   ├── .env                    # Переменные окружения
│   └── package.json
│
├── client/                     # Frontend (React + Vite)
│   ├── src/
│   │   ├── api/
│   │   │   └── chats.js        # Запросы к API
│   │   ├── components/
│   │   │   ├── Sidebar.jsx     # Список чатов (левая панель)
│   │   │   ├── ChatHeader.jsx  # Шапка активного чата
│   │   │   ├── ChatWindow.jsx  # Сообщения чата
│   │   │   └── MessageInput.jsx # Поле ввода
│   │   ├── hooks/
│   │   │   └── useChats.js     # Стейт-менеджер чатов
│   │   ├── App.jsx             # Корневой компонент
│   │   ├── index.css           # Глобальные стили (CSS переменные)
│   │   └── main.jsx            # Точка входа React
│   ├── index.html
│   ├── vite.config.js          # Vite + proxy на :8001
│   └── package.json
├── ai-service/                 # AI сервис (Python + FastAPI)
│   ├── app.py                  # FastAPI сервер с SSE стримингом
│   ├── rag_engine.py           # RAG логика (ChromaDB + GigaChat)
│   ├── requirements.txt        # Python зависимости
│   ├── Dockerfile              # Docker образ для AI сервиса
│   ├── safety_checklist_db/    # ChromaDB с 291+ документами
│   ├── pm1.py                  # Скрипт создания базы данных
│   ├── create_db_once.py       # Упрощенный скрипт создания БД
│   └── .env                    # Переменные окружения AI
│
├── docs/
│   ├── README.md               # Эта документация
│   ├── nginx.conf              # nginx конфиг с SSL
│   ├── nginx-http-only.conf    # nginx конфиг без SSL (для теста)
│   └── API.md                  # Документация API
│
├── docker-compose.yml          # Docker Compose (backend + ai-service)
├── Dockerfile                  # Docker образ для backend
├── .env                        # Общие переменные окружения
├── .dockerignore               # Исключения для Docker
├── ecosystem.config.js         # PM2 конфигурация
└── deploy.sh                   # Скрипт деплоя
```

---

## Установка и запуск

### Разработка (локально)

```bash
# 1. Бэкенд
cd server
npm install
npm start
# → http://localhost:8001

# 2. Фронтенд (в отдельном терминале)
cd client
npm install
npm run dev
# → http://localhost:5173 (проксирует /api → :8001)
```

### Продакшн (на сервере)

```bash
# Одной командой:
bash deploy.sh
```

---

## Nginx

### HTTP (тест без SSL)
```bash
sudo cp docs/nginx-http-only.conf /etc/nginx/sites-available/vzmakh-chat
sudo ln -s /etc/nginx/sites-available/vzmakh-chat /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### HTTPS (с SSL через certbot)
```bash
# 1. Получить сертификат
sudo certbot --nginx -d vzmakh.su -d www.vzmakh.su

# 2. Или сначала поставить конфиг, потом certbot
sudo cp docs/nginx.conf /etc/nginx/sites-available/vzmakh-chat
sudo ln -s /etc/nginx/sites-available/vzmakh-chat /etc/nginx/sites-enabled/
sudo certbot renew --dry-run
sudo nginx -t && sudo systemctl reload nginx
```

---

## Переменные окружения (`server/.env`)

| Переменная | По умолчанию | Описание |
|-----------|-------------|---------|
| `PORT`    | `8001`      | Порт сервера |
| `DB_PATH` | `./data/chat.db` | Путь к SQLite файлу |
| `NODE_ENV`| `production`| Окружение |

---

## PM2 команды

```bash
pm2 start ecosystem.config.js   # запустить
pm2 stop vzmakh-chat            # остановить
pm2 reload vzmakh-chat          # перезапустить без даунтайма
pm2 logs vzmakh-chat            # логи в реальном времени
pm2 monit                       # мониторинг (CPU/RAM)
pm2 list                        # список процессов
```

---

## База данных

SQLite файл: `server/data/chat.db`

### Схема

```sql
-- Чаты
CREATE TABLE chats (
  id         TEXT PRIMARY KEY,          -- UUID
  title      TEXT NOT NULL,             -- Заголовок (авто из первого сообщения)
  created_at INTEGER,                   -- Unix timestamp
  updated_at INTEGER                    -- Обновляется при каждом сообщении
);

-- Сообщения
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,          -- UUID
  chat_id    TEXT REFERENCES chats(id), -- ON DELETE CASCADE
  role       TEXT CHECK(role IN ('user','assistant','system')),
  content    TEXT NOT NULL,
  created_at INTEGER
);
```

### Резервная копия

```bash
# Создать бэкап
cp server/data/chat.db server/data/chat_backup_$(date +%Y%m%d).db

# Через sqlite3
sqlite3 server/data/chat.db ".backup backup.db"
```

---

## Интеграция с AI

Бэкенд хранит сообщения с `role: 'user' | 'assistant' | 'system'`.  
Для подключения AI (OpenAI, DeepSeek, local LLM) — добавь обработчик в `routes/chats.js`:

```js
// После сохранения user-сообщения вызови AI API,
// сохрани ответ через api.sendMessage(chatId, 'assistant', aiResponse)
```

---

## Возможные расширения

- [ ] WebSocket (socket.io) — real-time сообщения
- [ ] Интеграция OpenAI / DeepSeek / local LLM
- [ ] Экспорт истории чата (JSON / TXT)
- [ ] Поиск по сообщениям
- [ ] Markdown в сообщениях
- [ ] Загрузка файлов
