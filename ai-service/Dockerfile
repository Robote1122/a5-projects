FROM python:3.11-slim

WORKDIR /app

# Установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование кода
COPY . .

# Создание папки для данных
RUN mkdir -p /app/data

# Открываем порт
EXPOSE 8002

# Запуск
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8002"]