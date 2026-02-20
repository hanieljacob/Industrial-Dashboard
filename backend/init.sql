BEGIN;

CREATE TABLE IF NOT EXISTS facilities (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  location     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id           BIGSERIAL PRIMARY KEY,
  facility_id  BIGINT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  asset_type   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metrics (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  unit         TEXT
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id           BIGSERIAL PRIMARY KEY,
  facility_id  BIGINT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  asset_id     BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  metric_id    BIGINT NOT NULL REFERENCES metrics(id) ON DELETE RESTRICT,
  ts           TIMESTAMPTZ NOT NULL,
  value        DOUBLE PRECISION NOT NULL
);


-- Useful if you're not backfilling readings
-- ALTER TABLE sensor_readings
--   ADD CONSTRAINT sensor_readings_ts_not_future
--   CHECK (ts <= now() + interval '5 minutes');

CREATE INDEX IF NOT EXISTS idx_readings_asset_ts
  ON sensor_readings (asset_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_readings_facility_ts
  ON sensor_readings (facility_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_readings_metric_ts
  ON sensor_readings (metric_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_readings_fac_asset_metric_ts
  ON sensor_readings (facility_id, asset_id, metric_id, ts DESC);

COMMIT;