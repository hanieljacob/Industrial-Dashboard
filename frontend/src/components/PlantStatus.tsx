import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  ConfigProvider,
  DatePicker,
  Empty,
  Layout,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Tag,
  Typography,
  theme as antdTheme,
} from "antd";

import {
  API_BASE_URL,
  fetchDashboardSummary,
  fetchFacilities,
  fetchFacilityDetails,
  fetchSensorReadings,
} from "../api";
import type {
  DashboardMetric,
  DashboardSummary,
  Facility,
  FacilityDetails,
  SensorReading,
  TimeSeriesPoint,
} from "../types";
import TimeSeriesChart from "./TimeSeriesChart";

const REFRESH_INTERVAL_MS = 15_000;
const DEFAULT_HISTORY_WINDOW_HOURS = 24;
const MAX_CHART_POINTS = 180;
const ALL_ASSETS_VALUE = 0;
const DARK_MODE_STORAGE_KEY = "industrialdashboard_dark_mode";
const TIME_WINDOW_OPTIONS = [
  { label: "Last 1 hour", value: 1 },
  { label: "Last 6 hours", value: 6 },
  { label: "Last 24 hours", value: 24 },
  { label: "Last 72 hours", value: 72 },
  { label: "Last 7 days", value: 168 },
];

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const METRIC_LABELS: Record<string, string> = {
  flow_l_min: "Flow",
  power_kw: "Power",
  pressure_bar: "Pressure",
  temperature_c: "Temperature",
  vibration_mm_s: "Vibration",
};

function getMetricLabel(metricName: string) {
  if (METRIC_LABELS[metricName]) {
    return METRIC_LABELS[metricName];
  }
  return metricName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getAggregationLabel(aggregation: string) {
  if (aggregation === "sum") {
    return "Total";
  }
  if (aggregation === "avg") {
    return "Average";
  }
  return aggregation.toUpperCase();
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error while loading dashboard data.";
}

function getInitialDarkMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const saved = window.localStorage.getItem(DARK_MODE_STORAGE_KEY);
  if (saved === "true") {
    return true;
  }
  if (saved === "false") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function buildTimeSeries(readings: SensorReading[]): TimeSeriesPoint[] {
  const totalsByTimestamp = new Map<string, number>();

  for (const reading of readings) {
    totalsByTimestamp.set(
      reading.ts,
      (totalsByTimestamp.get(reading.ts) ?? 0) + reading.value,
    );
  }

  const sortedPoints = Array.from(totalsByTimestamp.entries())
    .map(([ts, value]) => ({ ts, value }))
    .sort((a, b) => a.ts.localeCompare(b.ts));

  if (sortedPoints.length <= MAX_CHART_POINTS) {
    return sortedPoints;
  }

  const step = Math.ceil(sortedPoints.length / MAX_CHART_POINTS);
  return sortedPoints.filter(
    (_point, index) => index % step === 0 || index === sortedPoints.length - 1,
  );
}

export default function PlantStatus() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(
    null,
  );
  const [facilityDetails, setFacilityDetails] = useState<FacilityDetails | null>(
    null,
  );
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [selectedMetricName, setSelectedMetricName] = useState<string | null>(
    null,
  );
  const [selectedAssetId, setSelectedAssetId] = useState<number>(ALL_ASSETS_VALUE);
  const [historyWindowHours, setHistoryWindowHours] = useState<number>(
    DEFAULT_HISTORY_WINDOW_HOURS,
  );
  const [customTimeRange, setCustomTimeRange] = useState<[Date, Date] | null>(null);
  const [trendPoints, setTrendPoints] = useState<TimeSeriesPoint[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return;
    }

    const timer = window.setInterval(() => {
      setRefreshToken((previous) => previous + 1);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled]);

  useEffect(() => {
    window.localStorage.setItem(DARK_MODE_STORAGE_KEY, String(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    let active = true;

    async function loadFacilities() {
      try {
        const allFacilities = await fetchFacilities();
        if (!active) return;

        setFacilities(allFacilities);
        setSelectedFacilityId((previous) => previous ?? allFacilities[0]?.id ?? null);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(toErrorMessage(error));
      } finally {
        if (active) {
          setIsBootstrapping(false);
        }
      }
    }

    void loadFacilities();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedFacilityId === null) {
      setFacilityDetails(null);
      setSelectedAssetId(ALL_ASSETS_VALUE);
      return;
    }
    const facilityId = selectedFacilityId;

    let active = true;

    async function loadFacilityDetails() {
      try {
        const details = await fetchFacilityDetails(facilityId);
        if (!active) return;

        setFacilityDetails(details);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(toErrorMessage(error));
      }
    }

    void loadFacilityDetails();

    return () => {
      active = false;
    };
  }, [selectedFacilityId]);

  useEffect(() => {
    if (!facilityDetails?.assets.length) {
      setSelectedAssetId(ALL_ASSETS_VALUE);
      return;
    }

    setSelectedAssetId((previous) => {
      if (previous === ALL_ASSETS_VALUE) {
        return previous;
      }

      const assetExists = facilityDetails.assets.some((asset) => asset.id === previous);
      return assetExists ? previous : ALL_ASSETS_VALUE;
    });
  }, [facilityDetails]);

  useEffect(() => {
    if (selectedFacilityId === null) {
      setSummary(null);
      return;
    }
    const facilityId = selectedFacilityId;

    let active = true;

    async function loadSummary() {
      setIsSummaryLoading(true);
      try {
        const nextSummary = await fetchDashboardSummary(facilityId);
        if (!active) return;

        setSummary(nextSummary);
        setSelectedMetricName((previous) => {
          if (
            previous &&
            nextSummary.metrics.some((metric) => metric.metric_name === previous)
          ) {
            return previous;
          }
          return nextSummary.metrics[0]?.metric_name ?? null;
        });
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(toErrorMessage(error));
      } finally {
        if (active) {
          setIsSummaryLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [selectedFacilityId, refreshToken]);

  useEffect(() => {
    if (selectedFacilityId === null || !selectedMetricName) {
      setTrendPoints([]);
      return;
    }
    const facilityId = selectedFacilityId;
    const metricName = selectedMetricName;
    const assetId = selectedAssetId === ALL_ASSETS_VALUE ? undefined : selectedAssetId;

    let active = true;

    async function loadTrend() {
      setIsTrendLoading(true);
      const end = customTimeRange ? customTimeRange[1] : new Date();
      const start = customTimeRange
        ? customTimeRange[0]
        : new Date(end.getTime() - historyWindowHours * 60 * 60 * 1000);
      try {
        const readings = await fetchSensorReadings({
          facilityId,
          assetId,
          metricName,
          start: start.toISOString(),
          end: end.toISOString(),
          limit: 4000,
        });
        if (!active) return;

        setTrendPoints(buildTimeSeries(readings));
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setErrorMessage(toErrorMessage(error));
        setTrendPoints([]);
      } finally {
        if (active) {
          setIsTrendLoading(false);
        }
      }
    }

    void loadTrend();

    return () => {
      active = false;
    };
  }, [
    refreshToken,
    selectedFacilityId,
    selectedMetricName,
    selectedAssetId,
    historyWindowHours,
    customTimeRange,
  ]);

  const selectedMetric: DashboardMetric | null = useMemo(() => {
    if (!summary || !selectedMetricName) return null;
    return summary.metrics.find((metric) => metric.metric_name === selectedMetricName) ?? null;
  }, [summary, selectedMetricName]);
  const assetOptions = useMemo(
    () => [
      { label: "All assets", value: ALL_ASSETS_VALUE },
      ...(facilityDetails?.assets.map((asset) => ({ label: asset.name, value: asset.id })) ?? []),
    ],
    [facilityDetails],
  );
  const selectedAssetLabel = useMemo(() => {
    if (selectedAssetId === ALL_ASSETS_VALUE) {
      return "All assets";
    }

    return facilityDetails?.assets.find((asset) => asset.id === selectedAssetId)?.name ?? "Selected asset";
  }, [facilityDetails, selectedAssetId]);
  const timeRangeLabel = useMemo(() => {
    if (!customTimeRange) {
      return `Window: ${historyWindowHours}h`;
    }

    return `${dateTimeFormatter.format(customTimeRange[0])} - ${dateTimeFormatter.format(customTimeRange[1])}`;
  }, [customTimeRange, historyWindowHours]);
  const pageBackground = isDarkMode ? "#0f1720" : "#f5f6fa";
  const appTheme = {
    algorithm: isDarkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: "#1f7b69",
    },
  };

  if (isBootstrapping) {
    return (
      <ConfigProvider theme={appTheme}>
        <Layout
          style={{
            alignItems: "center",
            background: pageBackground,
            display: "flex",
            justifyContent: "center",
            minHeight: "100vh",
          }}
        >
          <Spin size="large" tip="Loading dashboard data..." />
        </Layout>
      </ConfigProvider>
    );
  }

  if (facilities.length === 0) {
    return (
      <ConfigProvider theme={appTheme}>
        <Layout style={{ background: pageBackground, minHeight: "100vh", padding: 24 }}>
          <Card style={{ margin: "0 auto", maxWidth: 720, width: "100%" }}>
            {errorMessage ? (
              <Alert
                showIcon
                type="error"
                style={{ marginBottom: 16 }}
                message="Failed to load facilities from API"
                description={errorMessage}
              />
            ) : null}
            <Space direction="vertical" size="middle">
              <Space size={6}>
                <Typography.Text type="secondary">Dark mode</Typography.Text>
                <Switch checked={isDarkMode} onChange={setIsDarkMode} />
              </Space>
              <Empty description="No facilities available. Check your API and seeded data." />
              <Typography.Paragraph copyable={{ text: API_BASE_URL }}>
                API base URL: <Typography.Text code>{API_BASE_URL}</Typography.Text>
              </Typography.Paragraph>
            </Space>
          </Card>
        </Layout>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={appTheme}>
      <Layout style={{ background: pageBackground, minHeight: "100vh", padding: 24 }}>
        <Space direction="vertical" size="large" style={{ margin: "0 auto", width: "min(1200px, 100%)" }}>
          <Card>
            <Row align="middle" gutter={[16, 16]} justify="space-between">
              <Col flex="auto">
                <Space direction="vertical" size={2}>
                  <Space align="center" size="middle">
                    <span aria-label="industrial icon" role="img" style={{ fontSize: 24 }}>
                      🏭
                    </span>
                    <Typography.Title level={2} style={{ margin: 0 }}>
                      Plant Monitoring Dashboard
                    </Typography.Title>
                  </Space>
                  <Typography.Text type="secondary">
                    Live source: <Typography.Text code>{API_BASE_URL}</Typography.Text>
                  </Typography.Text>
                </Space>
              </Col>
              <Col>
                <Space wrap>
                  <Select<number>
                    onChange={(value) => setSelectedFacilityId(value)}
                    options={facilities.map((facility) => ({
                      label: facility.name,
                      value: facility.id,
                    }))}
                    style={{ minWidth: 260 }}
                    value={selectedFacilityId ?? undefined}
                  />
                  <Select<number>
                    disabled={!facilityDetails}
                    onChange={(value) => setSelectedAssetId(value)}
                    options={assetOptions}
                    style={{ minWidth: 260 }}
                    value={selectedAssetId}
                  />
                  <Select<number>
                    onChange={(value) => {
                      setHistoryWindowHours(value);
                      setCustomTimeRange(null);
                    }}
                    options={TIME_WINDOW_OPTIONS}
                    style={{ minWidth: 180 }}
                    value={historyWindowHours}
                  />
                  <DatePicker.RangePicker
                    allowClear
                    format="YYYY-MM-DD HH:mm"
                    onChange={(value) => {
                      if (!value || !value[0] || !value[1]) {
                        setCustomTimeRange(null);
                        return;
                      }

                      setCustomTimeRange([value[0].toDate(), value[1].toDate()]);
                      setRefreshToken((previous) => previous + 1);
                    }}
                    showTime
                  />
                  <Button
                    loading={isSummaryLoading || isTrendLoading}
                    onClick={() => setRefreshToken((previous) => previous + 1)}
                    type="primary"
                  >
                    Refresh
                  </Button>
                  <Space size={6}>
                    <Typography.Text type="secondary">Auto-refresh</Typography.Text>
                    <Switch
                      checked={autoRefreshEnabled}
                      onChange={(checked) => {
                        setAutoRefreshEnabled(checked);
                        if (checked) {
                          setRefreshToken((previous) => previous + 1);
                        }
                      }}
                    />
                  </Space>
                  <Space size={6}>
                    <Typography.Text type="secondary">Dark mode</Typography.Text>
                    <Switch checked={isDarkMode} onChange={setIsDarkMode} />
                  </Space>
                </Space>
              </Col>
            </Row>
          </Card>

          {errorMessage ? <Alert message={errorMessage} showIcon type="error" /> : null}

          <Card
            title="Current Plant Status"
          >
            {summary?.metrics.length ? (
              <Row gutter={[12, 12]}>
                {summary.metrics.map((metric) => {
                  const isActive = metric.metric_name === selectedMetricName;
                  return (
                    <Col key={metric.metric_name} lg={6} md={8} sm={12} xs={24}>
                      <Card
                        hoverable
                        onClick={() => setSelectedMetricName(metric.metric_name)}
                        size="small"
                        style={{
                          borderColor: isActive ? "#1677ff" : undefined,
                          borderWidth: isActive ? 2 : undefined,
                          cursor: "pointer",
                        }}
                      >
                        <Statistic
                          precision={2}
                          title={getMetricLabel(metric.metric_name)}
                          value={metric.aggregated_value}
                        />
                        <Space size={6} style={{ marginTop: 8 }} wrap>
                          {metric.unit ? <Tag>{metric.unit}</Tag> : null}
                          <Tag>{getAggregationLabel(metric.aggregation)}</Tag>
                          <Tag>{metric.contributing_assets} assets</Tag>
                        </Space>
                        <Typography.Text style={{ display: "block", marginTop: 6 }} type="secondary">
                          {dateTimeFormatter.format(new Date(metric.latest_ts))}
                        </Typography.Text>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            ) : (
              <Empty description="No metric summary available" />
            )}
          </Card>

          <Row gutter={[16, 16]}>
            <Col lg={24} xs={24}>
              <Card
                title={
                  selectedMetric
                    ? `${getMetricLabel(selectedMetric.metric_name)} Trend (${customTimeRange ? "custom range" : `last ${historyWindowHours}h`})`
                    : "Metric Trend"
                }
                extra={
                  <Space>
                    <Tag color={autoRefreshEnabled ? "processing" : "default"}>
                      {autoRefreshEnabled ? "Auto-refresh on (15s)" : "Auto-refresh off"}
                    </Tag>
                    <Tag>{timeRangeLabel}</Tag>
                    <Tag>{selectedAssetLabel}</Tag>
                    <Tag color={isDarkMode ? "blue" : "default"}>
                      {isDarkMode ? "Dark mode" : "Light mode"}
                    </Tag>
                    {selectedMetric ? <Tag>{getAggregationLabel(selectedMetric.aggregation)}</Tag> : null}
                    {selectedMetric ? <Tag>{selectedMetric.unit ?? "unitless"}</Tag> : null}
                  </Space>
                }
              >
                {isTrendLoading ? (
                  <Spin tip="Updating chart..." />
                ) : (
                  <TimeSeriesChart
                    points={trendPoints}
                    unit={selectedMetric?.unit ?? null}
                    isDarkMode={isDarkMode}
                  />
                )}
              </Card>
            </Col>
          </Row>

          <Typography.Text style={{ textAlign: "right" }} type="secondary">
            Last summary refresh: {summary ? dateTimeFormatter.format(new Date(summary.generated_at)) : "N/A"}
          </Typography.Text>
        </Space>
      </Layout>
    </ConfigProvider>
  );
}
