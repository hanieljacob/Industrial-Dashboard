"""Pydantic response schemas used by API routes."""

from datetime import datetime

from pydantic import BaseModel


class Facility(BaseModel):
    """Facility metadata."""

    id: int
    name: str
    location: str | None
    created_at: datetime


class Asset(BaseModel):
    """Asset metadata for one facility."""

    id: int
    facility_id: int
    name: str
    asset_type: str | None
    created_at: datetime


class FacilityDetails(Facility):
    """Facility payload enriched with related assets."""

    assets: list[Asset]


class SensorReading(BaseModel):
    """Normalized sensor reading payload returned by query endpoints."""

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
    """Aggregated metric values for dashboard status cards."""

    metric_name: str
    unit: str | None
    aggregation: str
    aggregation_values: dict[str, float]
    latest_ts: datetime
    aggregated_value: float
    contributing_assets: int


class DashboardSummary(BaseModel):
    """Facility-level dashboard snapshot payload."""

    facility_id: int
    generated_at: datetime
    metrics: list[DashboardMetric]
