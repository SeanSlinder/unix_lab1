# Горизонтально масштабируемый сервис — Агрегатор новостей

## Описание
Микросервисный сервис «Агрегатор новостей» на **Node.js 20**, использующий **Kafka** для распределения задач скрейпинга
и **PostgreSQL** для хранения результатов. Сервис горизонтально масштабируется за счёт репликации воркеров,
объединённых в Kafka consumer group.

---

## Архитектура

**Контейнеры:**
- **api** — Fastify API, принимает задания и отдаёт результаты
- **worker** — воркер-скрейпер (масштабируемый)
- **kafka** — брокер сообщений (KRaft mode)
- **postgres** — база данных
- **kafka-ui** — UI для наблюдения за Kafka (опционально)

**Kafka topics:**
- `crawl_requests` (12 партиций)
- `crawl_results`

**Consumer group:** `crawler-workers`

---

## API

### POST /jobs
```json
{
  "urls": ["https://example.com/article"],
  "timeout_ms": 8000,
  "respect_robots": false,
  "max_bytes": 2000000
}
```

Ответ:
```json
{ "job_id": "uuid", "queued": 10 }
```

### GET /jobs/:job_id
Статус задания

### GET /jobs/:job_id/articles
Список извлечённых статей

### GET /health
```json
{ "status": "ok" }
```

---

## Схема БД

**jobs**
- job_id (PK)
- state
- total / done / failed
- created_at / updated_at

**articles**
- UNIQUE(job_id, url)

**errors**
- UNIQUE(job_id, url)

---

## Запуск

```bash
docker compose up --build
```

Kafka UI: http://localhost:8080  
API: http://localhost:3000

---

## Масштабирование

```bash
docker compose up --scale worker=1
docker compose up --scale worker=3
docker compose up --scale worker=6
```

Наблюдение распределения партиций:
Kafka UI → Consumers → `crawler-workers`

---

## Демонстрация производительности

```bash
node scripts/submit_job.js scripts/seed_urls.json
```

---

## Дерево файлов

```
aggregator/
├─ docker-compose.yml
├─ Makefile
├─ .env.example
├─ .gitignore
├─ README.md
├─ infra/
│  └─ kafka/
│     └─ create-topics.sh
├─ scripts/
│  ├─ seed_urls.json
│  ├─ submit_job.js
│  └─ bench_job.js
└─ services/
   ├─ api/
   │  ├─ Dockerfile
   │  ├─ package.json
   │  ├─ migrations/
   │  │  └─ 001_init.sql
   │  └─ src/
   │     ├─ index.js
   │     ├─ server.js
   │     ├─ env.js
   │     ├─ db.js
   │     ├─ migrate.js
   │     ├─ kafka.js
   │     ├─ logger.js
   │     ├─ routes/
   │     │  ├─ health.js
   │     │  └─ jobs.js
   │     └─ consumers/
   │        └─ resultsSink.js
   └─ worker/
      ├─ Dockerfile
      ├─ package.json
      └─ src/
         ├─ index.js
         ├─ env.js
         ├─ kafka.js
         ├─ logger.js
         ├─ limiter.js
         ├─ robots.js
         ├─ fetcher.js
         └─ extractor.js
```