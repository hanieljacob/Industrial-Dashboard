# IndustrialDashboard

## Live Demo

- Frontend: `https://industrialdashboard-frontend.onrender.com`
- API base: `https://industrialdashboard-api.onrender.com`
- API docs: `https://industrialdashboard-api.onrender.com/docs`

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

Set allowed frontend origins for CORS (comma-separated).  
If unset, no cross-origin browser access is allowed:

```bash
export CORS_ALLOW_ORIGINS="https://your-frontend.onrender.com"
```

Optional regex-based CORS allowlist:

```bash
export CORS_ALLOW_ORIGIN_REGEX="^https://industrialdashboard-frontend.*\\.onrender\\.com$"
```

Start the API:

```bash
uvicorn backend.main:app --reload
```

Open API docs:
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Run frontend (Vite + React)

The frontend uses Ant Design + D3 and includes:

- facility and asset filters
- metric cards for current plant status
- custom datetime range picker + quick time-window presets
- auto-refresh toggle (polling)
- dark mode toggle
- chart hover tooltip for exact point timestamp/value

```bash
cd frontend
npm install
```

Set API URL (optional, defaults to `http://127.0.0.1:8000`):

```bash
echo 'VITE_API_BASE_URL=https://industrialdashboard-api.onrender.com' > .env.local
```

Start frontend:

```bash
npm run dev
```

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
   - Static web service: `industrialdashboard-frontend`
4. After deploy, the API starts with:
   - `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. `DATABASE_URL` is automatically injected from the Postgres service via `fromDatabase.connectionString`.
6. Free-tier note: Render only allows one active free Postgres (and one free Redis) per workspace.
7. Add `CORS_ALLOW_ORIGINS` in the API service environment variables, for example:
   - `https://your-frontend.onrender.com`
8. Frontend service gets `VITE_API_BASE_URL` from `render.yaml` pointing to:
   - `https://industrialdashboard-api.onrender.com`
9. If Render assigns different service URLs, update:
   - API env var `CORS_ALLOW_ORIGINS`
   - API env var `CORS_ALLOW_ORIGIN_REGEX` (if needed)
   - Frontend env var `VITE_API_BASE_URL`

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
curl "http://127.0.0.1:8000/sensor-readings?facility_id=1&asset_id=2&metric_name=power_kw&start=2026-02-23T00:00:00Z&end=2026-02-23T12:00:00Z&limit=200"
```

### `GET /facilities/{facility_id}/dashboard-summary`
Returns facility-level dashboard summary using the latest reading per asset+metric, then aggregates by metric.

Aggregation rules:
- `sum` for additive metrics (`power_kw`, `flow_l_min`)
- `avg` for state metrics (`temperature_c`, `pressure_bar`, `vibration_mm_s`)

Response metric fields include:
- `metric_name`
- `unit`
- `aggregation` (`sum` or `avg`)
- `aggregated_value`
- `latest_ts`
- `contributing_assets`

Example:

```bash
curl "http://127.0.0.1:8000/facilities/1/dashboard-summary"
```
