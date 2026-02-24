import hashlib
import json
from datetime import datetime

from fastapi import APIRouter, Request, Response, Query

from backend.api.db import get_connection
from backend.api.schemas import (
    DashboardMetric,
    DashboardSummary,
    Facility,
    FacilityDetails,
    SensorReading,
)
from backend.api.services import (
    get_dashboard_summary,
    get_facility_details,
    list_facilities,
    list_sensor_readings,
)

router = APIRouter()


def _serialize_metric_for_etag(metric: DashboardMetric) -> dict[str, object]:
    ordered_aggregation_values = {
        key: metric.aggregation_values[key]
        for key in sorted(metric.aggregation_values.keys())
    }
    return {
        "aggregation": metric.aggregation,
        "aggregation_values": ordered_aggregation_values,
        "aggregated_value": metric.aggregated_value,
        "contributing_assets": metric.contributing_assets,
        "latest_ts": metric.latest_ts.isoformat(),
        "metric_name": metric.metric_name,
        "unit": metric.unit,
    }


def _build_dashboard_summary_etag(summary: DashboardSummary) -> str:
    fingerprint = {
        "facility_id": summary.facility_id,
        "metrics": [_serialize_metric_for_etag(metric) for metric in summary.metrics],
    }
    payload = json.dumps(fingerprint, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"\"{digest}\""


def _normalize_etag_value(raw_value: str) -> str:
    value = raw_value.strip()
    if value.startswith("W/"):
        value = value[2:].strip()
    return value


def _etag_matches(if_none_match: str, current_etag: str) -> bool:
    normalized_current = _normalize_etag_value(current_etag)
    candidates = [value.strip() for value in if_none_match.split(",")]
    for candidate in candidates:
        if not candidate:
            continue
        if candidate == "*":
            return True
        if _normalize_etag_value(candidate) == normalized_current:
            return True
    return False


@router.get("/facilities", response_model=list[Facility])
def read_facilities() -> list[Facility]:
    with get_connection() as conn:
        return list_facilities(conn)


@router.get("/facilities/{facility_id}", response_model=FacilityDetails)
def read_facility_details(facility_id: int) -> FacilityDetails:
    with get_connection() as conn:
        return get_facility_details(conn, facility_id)


@router.get("/sensor-readings", response_model=list[SensorReading])
def read_sensor_readings(
    facility_id: int | None = None,
    asset_id: int | None = None,
    metric_name: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    after_ts: datetime | None = None,
    after_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=500, ge=1, le=5000),
) -> list[SensorReading]:
    with get_connection() as conn:
        return list_sensor_readings(
            conn=conn,
            facility_id=facility_id,
            asset_id=asset_id,
            metric_name=metric_name,
            start=start,
            end=end,
            after_ts=after_ts,
            after_id=after_id,
            limit=limit,
        )


@router.get(
    "/facilities/{facility_id}/dashboard-summary",
    response_model=DashboardSummary,
    responses={304: {"description": "Not Modified"}},
)
def read_dashboard_summary(
    facility_id: int,
    request: Request,
    response: Response,
) -> DashboardSummary | Response:
    with get_connection() as conn:
        summary = get_dashboard_summary(conn, facility_id)

    etag = _build_dashboard_summary_etag(summary)
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and _etag_matches(if_none_match, etag):
        return Response(
            status_code=304,
            headers={
                "Cache-Control": "private, must-revalidate",
                "ETag": etag,
            },
        )

    response.headers["Cache-Control"] = "private, must-revalidate"
    response.headers["ETag"] = etag
    return summary
