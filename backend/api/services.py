"""Database query and domain service functions for API handlers."""

from datetime import datetime, timezone

from fastapi import HTTPException

from backend.api.schemas import (
    Asset,
    DashboardMetric,
    DashboardSummary,
    Facility,
    FacilityDetails,
    SensorReading,
)


def _get_default_metric_aggregation(metric_name: str) -> str:
    """Return the default aggregation type for a metric card."""
    if metric_name in {"power_kw", "flow_l_min"}:
        return "sum"
    return "avg"


def _get_facility_row(conn, facility_id: int):
    """Fetch one facility row or return None when it does not exist."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, location, created_at
            FROM facilities
            WHERE id = %s;
            """,
            (facility_id,),
        )
        return cur.fetchone()


def list_facilities(conn) -> list[Facility]:
    """Return all facilities from the data store."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, location, created_at
            FROM facilities
            ORDER BY id;
            """
        )
        rows = cur.fetchall()

    return [Facility(id=row[0], name=row[1], location=row[2], created_at=row[3]) for row in rows]


def get_facility_details(conn, facility_id: int) -> FacilityDetails:
    """Return one facility and all assets linked to it."""
    facility_row = _get_facility_row(conn, facility_id)
    if facility_row is None:
        raise HTTPException(status_code=404, detail=f"Facility {facility_id} not found")

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, facility_id, name, asset_type, created_at
            FROM assets
            WHERE facility_id = %s
            ORDER BY id;
            """,
            (facility_id,),
        )
        asset_rows = cur.fetchall()

    assets = [
        Asset(
            id=row[0],
            facility_id=row[1],
            name=row[2],
            asset_type=row[3],
            created_at=row[4],
        )
        for row in asset_rows
    ]

    return FacilityDetails(
        id=facility_row[0],
        name=facility_row[1],
        location=facility_row[2],
        created_at=facility_row[3],
        assets=assets,
    )


def list_sensor_readings(
    conn,
    facility_id: int | None = None,
    asset_id: int | None = None,
    metric_name: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    after_ts: datetime | None = None,
    after_id: int | None = None,
    limit: int = 500,
) -> list[SensorReading]:
    """Return filtered sensor readings, optionally using a forward cursor."""
    if start and end and start > end:
        raise HTTPException(status_code=400, detail="start must be less than or equal to end")
    if (after_ts is None) != (after_id is None):
        raise HTTPException(
            status_code=400,
            detail="after_ts and after_id must be provided together",
        )

    # Build only supported filters; values are still parameterized.
    filters: list[str] = []
    params: list[object] = []

    if facility_id is not None:
        filters.append("sr.facility_id = %s")
        params.append(facility_id)

    if asset_id is not None:
        filters.append("sr.asset_id = %s")
        params.append(asset_id)

    if metric_name:
        filters.append("m.name = %s")
        params.append(metric_name)

    if start is not None:
        filters.append("sr.ts >= %s")
        params.append(start)

    if end is not None:
        filters.append("sr.ts <= %s")
        params.append(end)

    if after_ts is not None and after_id is not None:
        filters.append("(sr.ts > %s OR (sr.ts = %s AND sr.id > %s))")
        params.extend([after_ts, after_ts, after_id])

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    order_clause = "ORDER BY sr.ts ASC, sr.id ASC"
    if after_ts is None:
        order_clause = "ORDER BY sr.ts DESC, sr.id DESC"
    query = f"""
        SELECT
            sr.id,
            sr.facility_id,
            sr.asset_id,
            a.name AS asset_name,
            sr.metric_id,
            m.name AS metric_name,
            m.unit,
            sr.ts,
            sr.value
        FROM sensor_readings sr
        JOIN assets a ON a.id = sr.asset_id
        JOIN metrics m ON m.id = sr.metric_id
        {where_clause}
        {order_clause}
        LIMIT %s;
    """
    params.append(limit)

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [
        SensorReading(
            id=row[0],
            facility_id=row[1],
            asset_id=row[2],
            asset_name=row[3],
            metric_id=row[4],
            metric_name=row[5],
            unit=row[6],
            ts=row[7],
            value=row[8],
        )
        for row in rows
    ]


def get_dashboard_summary(conn, facility_id: int) -> DashboardSummary:
    """Return current per-metric status based on latest reading per asset/metric."""
    facility_row = _get_facility_row(conn, facility_id)
    if facility_row is None:
        raise HTTPException(status_code=404, detail=f"Facility {facility_id} not found")

    with conn.cursor() as cur:
        cur.execute(
            """
            WITH latest_per_asset_metric AS (
                -- Keep one most-recent reading per (asset_id, metric_id).
                SELECT DISTINCT ON (sr.asset_id, sr.metric_id)
                    sr.asset_id,
                    sr.metric_id,
                    sr.ts,
                    sr.value
                FROM sensor_readings sr
                WHERE sr.facility_id = %s
                ORDER BY sr.asset_id, sr.metric_id, sr.ts DESC, sr.id DESC
            )
            SELECT
                m.name AS metric_name,
                m.unit,
                MAX(l.ts) AS latest_ts,
                COUNT(*) AS contributing_assets,
                SUM(l.value) AS sum_value,
                AVG(l.value) AS avg_value,
                MIN(l.value) AS min_value,
                MAX(l.value) AS max_value
            FROM latest_per_asset_metric l
            JOIN metrics m ON m.id = l.metric_id
            GROUP BY m.name, m.unit
            ORDER BY m.name;
            """,
            (facility_id,),
        )
        rows = cur.fetchall()

    metrics: list[DashboardMetric] = []
    for row in rows:
        default_aggregation = _get_default_metric_aggregation(row[0])
        aggregation_values = {
            "sum": row[4],
            "avg": row[5],
            "min": row[6],
            "max": row[7],
        }
        metrics.append(
            DashboardMetric(
                metric_name=row[0],
                unit=row[1],
                aggregation=default_aggregation,
                aggregation_values=aggregation_values,
                latest_ts=row[2],
                aggregated_value=aggregation_values[default_aggregation],
                contributing_assets=row[3],
            )
        )
    return DashboardSummary(
        facility_id=facility_id,
        generated_at=datetime.now(timezone.utc),
        metrics=metrics,
    )
