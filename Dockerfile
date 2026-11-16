# Production image: builds the frontend, then serves it and the API from one container.
# For local development use docker-compose.yml instead.

FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV APP_ENV=production \
    PYTHONUNBUFFERED=1
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /frontend/dist ./static

EXPOSE 8000
# Hosting platforms pass the port to listen on as $PORT.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
