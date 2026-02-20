BEGIN;

-- This script is intended for local/dev use.
-- It resets table data and repopulates with synthetic, realistic-looking values.
TRUNCATE TABLE sensor_readings, assets, facilities, metrics RESTART IDENTITY CASCADE;

INSERT INTO facilities (name, location)
VALUES
  ('North Plant', 'Detroit, MI'),
  ('Coastal Refinery', 'Houston, TX'),
  ('Highland Works', 'Pittsburgh, PA');

INSERT INTO metrics (name, unit)
VALUES
  ('temperature_c', 'C'),
  ('pressure_bar', 'bar'),
  ('vibration_mm_s', 'mm/s'),
  ('power_kw', 'kW'),
  ('flow_l_min', 'L/min');

WITH asset_templates (asset_type, qty) AS (
  VALUES
    ('Compressor', 2),
    ('Pump', 2),
    ('Boiler', 1),
    ('Chiller', 1)
)
INSERT INTO assets (facility_id, name, asset_type)
SELECT
  f.id,
  format('%s %s-%s', f.name, t.asset_type, seq.n),
  t.asset_type
FROM facilities f
CROSS JOIN asset_templates t
CROSS JOIN LATERAL generate_series(1, t.qty) AS seq(n);

-- Optional tuning knobs (set these before running this script in the same psql session):
--   SET app.sample_hours_back = '24';
--   SET app.sample_step_minutes = '5';
WITH params AS (
  SELECT
    COALESCE(NULLIF(current_setting('app.sample_hours_back', true), ''), '24')::INT AS hours_back,
    COALESCE(NULLIF(current_setting('app.sample_step_minutes', true), ''), '5')::INT AS step_minutes
),
time_axis AS (
  SELECT
    generate_series(
      now() - make_interval(hours => (SELECT hours_back FROM params)),
      now() - interval '1 minute',
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
    t.ts,
    extract(epoch FROM t.ts) / 3600.0 AS hour_mark,
    random() AS noise
  FROM asset_metric am
  CROSS JOIN time_axis t
)
INSERT INTO sensor_readings (facility_id, asset_id, metric_id, ts, value)
SELECT
  s.facility_id,
  s.asset_id,
  s.metric_id,
  s.ts,
  CASE am.metric_name
    WHEN 'temperature_c' THEN
      round((68 + 8 * sin(s.hour_mark / 3 + s.asset_id * 0.2) + (s.noise - 0.5) * 1.8)::numeric, 2)::double precision
    WHEN 'pressure_bar' THEN
      round((12 + 1.5 * sin(s.hour_mark / 2 + s.asset_id * 0.1) + (s.noise - 0.5) * 0.8)::numeric, 2)::double precision
    WHEN 'vibration_mm_s' THEN
      round(greatest(0.05, (2.2 + 0.6 * sin(s.hour_mark * 1.4 + s.asset_id * 0.4) + (s.noise - 0.5) * 0.4)::numeric), 3)::double precision
    WHEN 'power_kw' THEN
      round((250 + 40 * sin(s.hour_mark / 4 + s.asset_id * 0.15) + (s.noise - 0.5) * 12)::numeric, 2)::double precision
    WHEN 'flow_l_min' THEN
      round((130 + 20 * sin(s.hour_mark / 2.5 + s.asset_id * 0.25) + (s.noise - 0.5) * 6)::numeric, 2)::double precision
    ELSE
      round((50 + (s.noise - 0.5) * 5)::numeric, 2)::double precision
  END AS value
FROM synthetic s
JOIN asset_metric am
  ON am.asset_id = s.asset_id
 AND am.metric_id = s.metric_id
ORDER BY s.asset_id, s.metric_id, s.ts;

COMMIT;
