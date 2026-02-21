export type Facility = {
  id: number;
  name: string;
  location: string | null;
  created_at: string;
};

export type Asset = {
  id: number;
  facility_id: number;
  name: string;
  asset_type: string | null;
  created_at: string;
};

export type FacilityDetails = Facility & {
  assets: Asset[];
};

export type SensorReading = {
  id: number;
  facility_id: number;
  asset_id: number;
  asset_name: string;
  metric_id: number;
  metric_name: string;
  unit: string | null;
  ts: string;
  value: number;
};

export type DashboardMetric = {
  metric_name: string;
  unit: string | null;
  latest_ts: string;
  total_value: number;
  contributing_assets: number;
};

export type DashboardSummary = {
  facility_id: number;
  generated_at: string;
  metrics: DashboardMetric[];
};

export type TimeSeriesPoint = {
  ts: string;
  value: number;
};
