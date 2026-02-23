import type {
  DashboardSummary,
  Facility,
  FacilityDetails,
  SensorReading,
} from "./types";

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");

type QueryValue = string | number | undefined;

async function apiGet<T>(
  path: string,
  queryParams?: Record<string, QueryValue>,
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Request failed (${response.status} ${response.statusText}): ${message || "No response body"}`,
    );
  }

  return response.json() as Promise<T>;
}

export function fetchFacilities() {
  return apiGet<Facility[]>("/facilities");
}

export function fetchFacilityDetails(facilityId: number) {
  return apiGet<FacilityDetails>(`/facilities/${facilityId}`);
}

export function fetchDashboardSummary(facilityId: number) {
  return apiGet<DashboardSummary>(`/facilities/${facilityId}/dashboard-summary`);
}

export function fetchSensorReadings(args: {
  facilityId: number;
  assetId?: number;
  metricName?: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  return apiGet<SensorReading[]>("/sensor-readings", {
    facility_id: args.facilityId,
    asset_id: args.assetId,
    metric_name: args.metricName,
    start: args.start,
    end: args.end,
    limit: args.limit ?? 500,
  });
}
