BEGIN;

-- Append synthetic sensor data without deleting existing rows.
-- Safe for prod-like environments where facilities/assets/metrics already exist.
--
-- Optional tuning knobs (set these before running this script in the same psql session):
--   SET app.sample_hours_back_if_empty = '6';  -- Only used if sensor_readings is empty
--   SET app.sample_step_minutes = '5';         -- Sampling interval
--   SET app.sample_end_lag_minutes = '1';      -- Keep newest generated point slightly behind now

WITH params AS (
  SELECT
    GREATEST(
      1,
      COALESCE(NULLIF(current_setting('app.sample_hours_back_if_empty', true), ''), '6')::INT
    ) AS hours_back_if_empty,
    GREATEST(
      1,
      COALESCE(NULLIF(current_setting('app.sample_step_minutes', true), ''), '5')::INT
    ) AS step_minutes,
    GREATEST(
      0,
      COALESCE(NULLIF(current_setting('app.sample_end_lag_minutes', true), ''), '1')::INT
    ) AS end_lag_minutes
),
bounds AS (
  SELECT
    COALESCE(
      (SELECT MAX(sr.ts) FROM sensor_readings sr),
      now() - make_interval(hours => (SELECT hours_back_if_empty FROM params))
    ) AS last_ts,
    now() - make_interval(mins => (SELECT end_lag_minutes FROM params)) AS end_ts
),
time_axis AS (
  SELECT
    generate_series(
      (SELECT last_ts + make_interval(mins => (SELECT step_minutes FROM params)) FROM bounds),
      (SELECT end_ts FROM bounds),
      make_interval(mins => (SELECT step_minutes FROM params))
    ) AS ts
),
asset_metric AS (
  SELECT
    a.id AS asset_id,
    a.facility_id,
    m.id AS metric_id,
    m.name AS metric_name
  FROM assets a
  CROSS JOIN metrics m
),
synthetic AS (
  SELECT
    am.facility_id,
    am.asset_id,
    am.metric_id,
    am.metric_name,
    t.ts,
    extract(epoch FROM t.ts) / 3600.0 AS hour_mark,
    random() AS noise
  FROM asset_metric am
  CROSS JOIN time_axis t
),
inserted AS (
  INSERT INTO sensor_readings (facility_id, asset_id, metric_id, ts, value)
  SELECT
    s.facility_id,
    s.asset_id,
    s.metric_id,
    s.ts,
    CASE s.metric_name
      WHEN 'temperature_c' THEN
        round(
          (68 + 8 * sin(s.hour_mark / 3 + s.asset_id * 0.2) + (s.noise - 0.5) * 1.8)::numeric,
          2
        )::double precision
      WHEN 'pressure_bar' THEN
        round(
          (12 + 1.5 * sin(s.hour_mark / 2 + s.asset_id * 0.1) + (s.noise - 0.5) * 0.8)::numeric,
          2
        )::double precision
      WHEN 'vibration_mm_s' THEN
        round(
          greatest(
            0.05,
            (2.2 + 0.6 * sin(s.hour_mark * 1.4 + s.asset_id * 0.4) + (s.noise - 0.5) * 0.4)::numeric
          ),
          3
        )::double precision
      WHEN 'power_kw' THEN
        round(
          (250 + 40 * sin(s.hour_mark / 4 + s.asset_id * 0.15) + (s.noise - 0.5) * 12)::numeric,
          2
        )::double precision
      WHEN 'flow_l_min' THEN
        round(
          (130 + 20 * sin(s.hour_mark / 2.5 + s.asset_id * 0.25) + (s.noise - 0.5) * 6)::numeric,
          2
        )::double precision
      ELSE
        round((50 + (s.noise - 0.5) * 5)::numeric, 2)::double precision
    END AS value
  FROM synthetic s
  ORDER BY s.asset_id, s.metric_id, s.ts
  RETURNING 1
)
SELECT COUNT(*)::INT AS inserted_rows
FROM inserted;

COMMIT;
