import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Layout,
  List,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
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
const HISTORY_WINDOW_HOURS = 24;
const MAX_CHART_POINTS = 180;

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

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error while loading dashboard data.";
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
  const [trendPoints, setTrendPoints] = useState<TimeSeriesPoint[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshToken((previous) => previous + 1);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

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

    let active = true;

    async function loadTrend() {
      setIsTrendLoading(true);
      const end = new Date();
      const start = new Date(end.getTime() - HISTORY_WINDOW_HOURS * 60 * 60 * 1000);
      try {
        const readings = await fetchSensorReadings({
          facilityId,
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
  }, [refreshToken, selectedFacilityId, selectedMetricName]);

  const selectedMetric: DashboardMetric | null = useMemo(() => {
    if (!summary || !selectedMetricName) return null;
    return summary.metrics.find((metric) => metric.metric_name === selectedMetricName) ?? null;
  }, [summary, selectedMetricName]);

  if (isBootstrapping) {
    return (
      <Layout
        style={{
          alignItems: "center",
          background: "#f5f6fa",
          display: "flex",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <Spin size="large" tip="Loading dashboard data..." />
      </Layout>
    );
  }

  if (facilities.length === 0) {
    return (
      <Layout style={{ background: "#f5f6fa", minHeight: "100vh", padding: 24 }}>
        <Card style={{ margin: "0 auto", maxWidth: 720, width: "100%" }}>
          <Empty description="No facilities available. Check your API and seeded data." />
          <Typography.Paragraph copyable={{ text: API_BASE_URL }}>
            API base URL: <Typography.Text code>{API_BASE_URL}</Typography.Text>
          </Typography.Paragraph>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout style={{ background: "#f5f6fa", minHeight: "100vh", padding: 24 }}>
      <Space direction="vertical" size="large" style={{ margin: "0 auto", width: "min(1200px, 100%)" }}>
        <Card>
          <Row align="middle" gutter={[16, 16]} justify="space-between">
            <Col>
              <Typography.Title level={2} style={{ margin: 0 }}>
                Plant Monitoring Dashboard
              </Typography.Title>
              <Typography.Text type="secondary">
                Live source: <Typography.Text code>{API_BASE_URL}</Typography.Text>
              </Typography.Text>
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
                <Button
                  loading={isSummaryLoading || isTrendLoading}
                  onClick={() => setRefreshToken((previous) => previous + 1)}
                  type="primary"
                >
                  Refresh
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {errorMessage ? <Alert message={errorMessage} showIcon type="error" /> : null}

        <Card
          title="Current Plant Status"
          extra={
            <Typography.Text type="secondary">
              Latest values aggregated across facility assets
            </Typography.Text>
          }
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
                        value={metric.total_value}
                      />
                      <Space size={6} style={{ marginTop: 8 }} wrap>
                        {metric.unit ? <Tag>{metric.unit}</Tag> : null}
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
          <Col lg={16} xs={24}>
            <Card
              title={
                selectedMetric
                  ? `${getMetricLabel(selectedMetric.metric_name)} Trend (last ${HISTORY_WINDOW_HOURS}h)`
                  : "Metric Trend"
              }
              extra={
                <Space>
                  <Tag color="processing">Auto-refresh 15s</Tag>
                  {selectedMetric ? <Tag>{selectedMetric.unit ?? "unitless"}</Tag> : null}
                </Space>
              }
            >
              {isTrendLoading ? (
                <Spin tip="Updating chart..." />
              ) : (
                <TimeSeriesChart points={trendPoints} unit={selectedMetric?.unit ?? null} />
              )}
            </Card>
          </Col>

          <Col lg={8} xs={24}>
            <Card
              title="Facility Assets"
              extra={
                facilityDetails?.location ? (
                  <Typography.Text type="secondary">{facilityDetails.location}</Typography.Text>
                ) : null
              }
            >
              {facilityDetails?.assets.length ? (
                <List
                  dataSource={facilityDetails.assets}
                  renderItem={(asset) => (
                    <List.Item>
                      <Space direction="vertical" size={0} style={{ width: "100%" }}>
                        <Typography.Text strong>{asset.name}</Typography.Text>
                        <Typography.Text type="secondary">
                          {asset.asset_type ?? "Unknown type"}
                        </Typography.Text>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="No assets found" />
              )}
            </Card>
          </Col>
        </Row>

        <Typography.Text style={{ textAlign: "right" }} type="secondary">
          Last summary refresh: {summary ? dateTimeFormatter.format(new Date(summary.generated_at)) : "N/A"}
        </Typography.Text>
      </Space>
    </Layout>
  );
}
