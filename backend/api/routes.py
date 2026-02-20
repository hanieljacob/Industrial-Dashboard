from datetime import datetime

from fastapi import APIRouter, Query

from backend.api.db import get_connection
from backend.api.schemas import DashboardSummary, Facility, FacilityDetails, SensorReading
from backend.api.services import (
    get_dashboard_summary,
    get_facility_details,
    list_facilities,
    list_sensor_readings,
)

router = APIRouter()


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
            limit=limit,
        )


@router.get("/facilities/{facility_id}/dashboard-summary", response_model=DashboardSummary)
def read_dashboard_summary(facility_id: int) -> DashboardSummary:
    with get_connection() as conn:
        return get_dashboard_summary(conn, facility_id)
