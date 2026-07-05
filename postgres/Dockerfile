FROM postgres:15-alpine

# Копируем скрипты инициализации
COPY ./init/*.sql /docker-entrypoint-initdb.d/

# Устанавливаем локаль
ENV LANG=ru_RU.UTF-8
ENV LC_ALL=ru_RU.UTF-8