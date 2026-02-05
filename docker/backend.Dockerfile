FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend/app /app/app
COPY backend/alembic.ini /app/alembic.ini
COPY backend/alembic /app/alembic
COPY backend/start.sh /app/start.sh

ENV PRINTMUX_STORAGE_DIR=/app/storage \
    PRINTMUX_DATABASE_URL=sqlite:////app/data/printmux.db

RUN mkdir -p /app/storage /app/data \
    && chmod +x /app/start.sh

EXPOSE 8000

CMD ["/app/start.sh"]
