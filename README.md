# IndustrialDashboard

## Requirements

- Python 3.11+
- PostgreSQL running locally (default: `localhost:5432`)
- A PostgreSQL database you can write to (examples below use `postgres`)

Install backend dependencies:

```bash
pip install fastapi "uvicorn[standard]" "psycopg[binary]"
```

## Database setup

Create schema:

```bash
psql -h localhost -U hanie -d postgres -f backend/init.sql
```

Seed synthetic sample data (`facilities`, `assets`, `metrics`, `sensor_readings`):

```bash
psql -h localhost -U hanie -d postgres -f backend/seed_sample_data.sql
```

Optional sample-data tuning (same `psql` session):

```sql
SET app.sample_hours_back = '72';
SET app.sample_step_minutes = '10';
\i backend/seed_sample_data.sql
```

Notes:
- `seed_sample_data.sql` truncates and recreates table data each run.
- Generated timestamps stop at `now() - 1 minute` to avoid future-time conflicts.

## Run backend API

Set database URL (optional if you use the default):

```bash
export DATABASE_URL="postgresql://hanie@localhost:5432/postgres"
```

Start the API:

```bash
uvicorn backend.main:app --reload
```

Open API docs:
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Backend structure

```text
backend/
  main.py              # FastAPI app entrypoint
  api/
    db.py              # DB connection/config
    schemas.py         # Pydantic response models
    services.py        # Query/business logic
    routes.py          # HTTP routes
```

## Deploy on Render (Postgres + API)

This repo now includes `render.yaml` and `requirements.txt` for Render deployment.

### Option A: Blueprint deploy (recommended)

1. Push this repo to GitHub/GitLab.
2. In Render, go to **New** -> **Blueprint** and select your repo.
3. Render will provision:
   - Postgres database: `industrialdashboard-db`
   - Web service: `industrialdashboard-api`
4. After deploy, the API starts with:
   - `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. `DATABASE_URL` is automatically injected from the Postgres service via `fromDatabase.connectionString`.

### Option B: Manual DB creation

1. In Render, create a new **Postgres** service.
2. In your API service, set `DATABASE_URL` to that database's **internal URL** (preferred for same-region Render services).

### Initialize schema/data in Render Postgres

From your database page in Render, open **Connect** and use the provided `psql` command (or external URL), then run:

```bash
psql "<YOUR_RENDER_DATABASE_URL>" -f backend/init.sql
psql "<YOUR_RENDER_DATABASE_URL>" -f backend/seed_sample_data.sql
```

If you connect from outside Render and hit SSL issues, use a modern PostgreSQL client with TLS 1.2+ as required by Render.

## API endpoints

### `GET /facilities`
Returns all facilities.

### `GET /facilities/{facility_id}`
Returns one facility and all of its assets.

### `GET /sensor-readings`
Returns sensor readings with optional filters.

Query params:
- `facility_id` (int)
- `asset_id` (int)
- `metric_name` (string)
- `start` (ISO datetime)
- `end` (ISO datetime)
- `limit` (int, default `500`, max `5000`)

Example:

```bash
curl "http://127.0.0.1:8000/sensor-readings?facility_id=1&metric_name=power_kw&limit=20"
```

### `GET /facilities/{facility_id}/dashboard-summary`
Returns facility-level dashboard summary using latest reading per asset+metric, then aggregates by metric.

Example:

```bash
curl "http://127.0.0.1:8000/facilities/1/dashboard-summary"
```
