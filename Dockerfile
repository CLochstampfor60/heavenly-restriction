# Heavenly Restriction: one container serves the API and the built PWA from one origin.

# ---- Build the PWA ----
FROM node:20-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY design-system/ /src/design-system/
COPY frontend/ ./
RUN npm run build

# ---- Runtime ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY backend/migrations backend/migrations
COPY backend/alembic.ini backend/alembic.ini
COPY --from=web /src/frontend/dist frontend/dist
# Unprivileged user; /app/data is the only writable path (a volume).
RUN useradd --system --uid 10001 --no-create-home hr \
    && mkdir -p /app/data \
    && chown 10001:10001 /app/data
USER 10001
EXPOSE 8000
CMD ["sh", "-c", "alembic -c backend/alembic.ini upgrade head && exec python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000"]
