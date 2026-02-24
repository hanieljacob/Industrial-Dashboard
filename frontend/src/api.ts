import type {
  DashboardSummary,
  Facility,
  FacilityDetails,
  SensorReading,
} from "./types";

const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");
const dashboardSummaryEtagByFacility = new Map<number, string>();
const dashboardSummaryCacheByFacility = new Map<number, DashboardSummary>();

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

export async function fetchDashboardSummary(facilityId: number) {
  const url = new URL(`${API_BASE_URL}/facilities/${facilityId}/dashboard-summary`);
  const previousEtag = dashboardSummaryEtagByFacility.get(facilityId);
  const headers: HeadersInit = { Accept: "application/json" };
  if (previousEtag) {
    headers["If-None-Match"] = previousEtag;
  }

  const response = await fetch(url.toString(), { headers });

  if (response.status === 304) {
    const cachedSummary = dashboardSummaryCacheByFacility.get(facilityId);
    if (cachedSummary) {
      return cachedSummary;
    }
    throw new Error(
      `Request failed (304 Not Modified): missing cached summary for facility ${facilityId}`,
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Request failed (${response.status} ${response.statusText}): ${message || "No response body"}`,
    );
  }

  const etag = response.headers.get("ETag");
  if (etag) {
    dashboardSummaryEtagByFacility.set(facilityId, etag);
  }

  const summary = (await response.json()) as DashboardSummary;
  dashboardSummaryCacheByFacility.set(facilityId, summary);
  return summary;
}

export function fetchSensorReadings(args: {
  facilityId: number;
  assetId?: number;
  metricName?: string;
  start?: string;
  end?: string;
  afterTs?: string;
  afterId?: number;
  limit?: number;
}) {
  return apiGet<SensorReading[]>("/sensor-readings", {
    facility_id: args.facilityId,
    asset_id: args.assetId,
    metric_name: args.metricName,
    start: args.start,
    end: args.end,
    after_ts: args.afterTs,
    after_id: args.afterId,
    limit: args.limit ?? 500,
  });
}
