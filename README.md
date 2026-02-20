# IndustrialDashboard

## Database setup

Create schema:

```bash
psql -h localhost -U hanie -d postgres -f backend/init.sql
```

Seed synthetic sample data for all tables (`facilities`, `assets`, `metrics`, `sensor_readings`):

```bash
psql -h localhost -U hanie -d postgres -f backend/seed_sample_data.sql
```

## Optional sample-data tuning

In a `psql` session, set these values before running the seed script:

```sql
SET app.sample_hours_back = '72';
SET app.sample_step_minutes = '10';
\i backend/seed_sample_data.sql
```

Notes:
- The seed script truncates and recreates table data each run.
- The generated timestamps stop at `now() - 1 minute` to avoid future-time constraint conflicts.
