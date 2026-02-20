from datetime import datetime

from pydantic import BaseModel


class Facility(BaseModel):
    id: int
    name: str
    location: str | None
    created_at: datetime


class Asset(BaseModel):
    id: int
    facility_id: int
    name: str
    asset_type: str | None
    created_at: datetime


class FacilityDetails(Facility):
    assets: list[Asset]


class SensorReading(BaseModel):
    id: int
    facility_id: int
    asset_id: int
    asset_name: str
    metric_id: int
    metric_name: str
    unit: str | None
    ts: datetime
    value: float


class DashboardMetric(BaseModel):
    metric_name: str
    unit: str | None
    latest_ts: datetime
    total_value: float
    contributing_assets: int


class DashboardSummary(BaseModel):
    facility_id: int
    generated_at: datetime
    metrics: list[DashboardMetric]
