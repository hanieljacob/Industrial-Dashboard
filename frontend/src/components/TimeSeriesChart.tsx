import { useEffect, useMemo, useRef, useState } from "react";
import { Empty, Space, Tag, Typography } from "antd";
import * as d3 from "d3";

import type { SensorReading, TimeSeriesPoint } from "../types";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const ASSET_COLORS = [
  "#3b82f6",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#f43f5e",
  "#a855f7",
  "#eab308",
  "#14b8a6",
  "#ef4444",
];

type TimeSeriesChartProps = {
  points: TimeSeriesPoint[];
  readings?: SensorReading[];
  unit: string | null;
  isDarkMode?: boolean;
};

type ChartDatum = {
  ts: Date;
  value: number;
};

type AssetPointDatum = {
  ts: Date;
  value: number;
  assetId: number;
  assetName: string;
  color: string;
};

type HoverAssetValue = {
  assetId: number;
  assetName: string;
  color: string;
  value: number;
};

type HoverDatum = {
  ts: Date;
  value: number;
  xPct: number;
  yPct: number;
  assetValues: HoverAssetValue[];
};

const tooltipDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export default function TimeSeriesChart({
  points,
  readings = [],
  unit,
  isDarkMode = false,
}: TimeSeriesChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoverDatum | null>(null);

  const data = useMemo<ChartDatum[]>(
    () =>
      points
        .map((point) => ({ ts: new Date(point.ts), value: point.value }))
        .filter((point) => !Number.isNaN(point.ts.getTime()))
        .sort((a, b) => a.ts.getTime() - b.ts.getTime()),
    [points],
  );

  const readingData = useMemo(
    () =>
      readings
        .map((reading) => ({
          ts: new Date(reading.ts),
          value: reading.value,
          assetId: reading.asset_id,
          assetName: reading.asset_name,
        }))
        .filter((reading) => !Number.isNaN(reading.ts.getTime()))
        .sort((a, b) => a.ts.getTime() - b.ts.getTime()),
    [readings],
  );

  const assetColorById = useMemo(() => {
    const ids = Array.from(new Set(readingData.map((reading) => reading.assetId))).sort(
      (a, b) => a - b,
    );
    const colors = new Map<number, string>();

    ids.forEach((id, index) => {
      colors.set(id, ASSET_COLORS[index % ASSET_COLORS.length]);
    });

    return colors;
  }, [readingData]);

  const assetPoints = useMemo<AssetPointDatum[]>(
    () =>
      readingData.map((reading) => ({
        ts: reading.ts,
        value: reading.value,
        assetId: reading.assetId,
        assetName: reading.assetName,
        color: assetColorById.get(reading.assetId) ?? ASSET_COLORS[0],
      })),
    [assetColorById, readingData],
  );

  const plottedAssetPoints = useMemo(() => {
    const MAX_MARKERS = 1800;
    if (assetPoints.length <= MAX_MARKERS) {
      return assetPoints;
    }

    const step = Math.ceil(assetPoints.length / MAX_MARKERS);
    return assetPoints.filter(
      (_point, index) => index % step === 0 || index === assetPoints.length - 1,
    );
  }, [assetPoints]);

  const assetLegend = useMemo(() => {
    const seen = new Set<number>();
    const items: Array<{ assetId: number; assetName: string; color: string }> = [];

    for (const point of assetPoints) {
      if (seen.has(point.assetId)) {
        continue;
      }

      seen.add(point.assetId);
      items.push({
        assetId: point.assetId,
        assetName: point.assetName,
        color: point.color,
      });
    }

    return items.sort((a, b) => a.assetName.localeCompare(b.assetName));
  }, [assetPoints]);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) {
      return;
    }

    const palette = isDarkMode
      ? {
          axisDomain: "#4b5563",
          axisText: "#cbd5e1",
          gridStroke: "#334155",
          line: "#34d399",
          lineArea: "rgba(52, 211, 153, 0.22)",
          pointStroke: "#0b1220",
        }
      : {
          axisDomain: "#c8cec9",
          axisText: "#5f6b66",
          gridStroke: "#d8ddd8",
          line: "#1f7b69",
          lineArea: "rgba(31, 123, 105, 0.18)",
          pointStroke: "#ffffff",
        };

    const width = 920;
    const height = 300;
    const margin = { top: 12, right: 20, bottom: 36, left: 58 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const chartRoot = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "none")
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const extent = d3.extent(data, (d) => d.ts);
    const minTime = extent[0] ?? data[0].ts;
    const maxTime = extent[1] ?? data[data.length - 1].ts;

    const allValues = [...data.map((d) => d.value), ...assetPoints.map((d) => d.value)];
    const maxValue = d3.max(allValues) ?? 0;
    const minValue = d3.min(allValues) ?? 0;

    const xScale = d3.scaleTime().domain([minTime, maxTime]).range([0, plotWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([Math.min(minValue, 0), maxValue])
      .nice()
      .range([plotHeight, 0]);

    const yGridAxis = d3.axisLeft(yScale).ticks(5).tickSize(-plotWidth).tickFormat(() => "");

    chartRoot
      .append("g")
      .call(yGridAxis)
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g.selectAll("line").attr("stroke", palette.gridStroke).attr("stroke-dasharray", "4 4"),
      );

    chartRoot
      .append("g")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((value) => numberFormatter.format(Number(value))),
      )
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("text").attr("fill", palette.axisText));

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(4)
      .tickFormat((value) =>
        d3.timeFormat("%I:%M %p")(
          value instanceof Date ? value : new Date(Number(value)),
        ),
      );

    chartRoot
      .append("g")
      .attr("transform", `translate(0,${plotHeight})`)
      .call(
        xAxis as unknown as (
          selection: d3.Selection<SVGGElement, unknown, null, undefined>,
        ) => void,
      )
      .call((g) => g.select(".domain").attr("stroke", palette.axisDomain))
      .call((g) => g.selectAll("line").attr("stroke", palette.axisDomain))
      .call((g) => g.selectAll("text").attr("fill", palette.axisText));

    const areaGenerator = d3
      .area<ChartDatum>()
      .x((d) => xScale(d.ts))
      .y0(plotHeight)
      .y1((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    const lineGenerator = d3
      .line<ChartDatum>()
      .x((d) => xScale(d.ts))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    chartRoot
      .append("path")
      .datum(data)
      .attr("fill", palette.lineArea)
      .attr("d", areaGenerator);

    chartRoot
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", palette.line)
      .attr("stroke-linecap", "round")
      .attr("stroke-width", 3)
      .attr("d", lineGenerator);

    chartRoot
      .append("g")
      .selectAll("circle")
      .data(plottedAssetPoints)
      .join("circle")
      .attr("cx", (d) => xScale(d.ts))
      .attr("cy", (d) => yScale(d.value))
      .attr("r", 2.6)
      .attr("fill", (d) => d.color)
      .attr("opacity", 0.9)
      .attr("stroke", palette.pointStroke)
      .attr("stroke-width", 0.7);

    const last = data[data.length - 1];
    chartRoot
      .append("circle")
      .attr("cx", xScale(last.ts))
      .attr("cy", yScale(last.value))
      .attr("fill", palette.line)
      .attr("r", 4.5)
      .attr("stroke", palette.pointStroke)
      .attr("stroke-width", 2);

    const hoverGuide = chartRoot
      .append("line")
      .attr("stroke", palette.axisDomain)
      .attr("stroke-dasharray", "4 4")
      .attr("stroke-width", 1.5)
      .style("display", "none");

    const hoverPoint = chartRoot
      .append("circle")
      .attr("fill", palette.line)
      .attr("r", 5)
      .attr("stroke", palette.pointStroke)
      .attr("stroke-width", 2.5)
      .style("display", "none");

    const bisectByTime = d3.bisector((d: ChartDatum) => d.ts.getTime()).center;
    const assetValuesByTimestamp = new Map<number, HoverAssetValue[]>();

    for (const point of assetPoints) {
      const tsKey = point.ts.getTime();
      const values = assetValuesByTimestamp.get(tsKey);
      const nextValue = {
        assetId: point.assetId,
        assetName: point.assetName,
        color: point.color,
        value: point.value,
      };
      if (!values) {
        assetValuesByTimestamp.set(tsKey, [nextValue]);
      } else {
        values.push(nextValue);
      }
    }

    for (const values of assetValuesByTimestamp.values()) {
      values.sort((a, b) => a.assetName.localeCompare(b.assetName));
    }

    chartRoot
      .append("rect")
      .attr("width", plotWidth)
      .attr("height", plotHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event);
        const clampedX = Math.max(0, Math.min(plotWidth, mx));
        const hoveredTime = xScale.invert(clampedX).getTime();
        const index = bisectByTime(data, hoveredTime);
        const point = data[Math.max(0, Math.min(data.length - 1, index))];

        const pointX = xScale(point.ts);
        const pointY = yScale(point.value);

        hoverGuide
          .attr("x1", pointX)
          .attr("x2", pointX)
          .attr("y1", 0)
          .attr("y2", plotHeight)
          .style("display", null);

        hoverPoint
          .attr("cx", pointX)
          .attr("cy", pointY)
          .style("display", null);

        setHoveredPoint({
          ts: point.ts,
          value: point.value,
          xPct: ((margin.left + pointX) / width) * 100,
          yPct: ((margin.top + pointY) / height) * 100,
          assetValues: assetValuesByTimestamp.get(point.ts.getTime()) ?? [],
        });
      })
      .on("mouseleave", () => {
        hoverGuide.style("display", "none");
        hoverPoint.style("display", "none");
        setHoveredPoint(null);
      });
  }, [assetPoints, data, isDarkMode, plottedAssetPoints]);

  if (data.length === 0) {
    return <Empty description="No points available for the selected metric" />;
  }

  const latest = data[data.length - 1];
  const tooltipTransform = hoveredPoint
    ? hoveredPoint.xPct > 84
      ? "translate(calc(-100% + 12px), calc(-100% - 10px))"
      : hoveredPoint.xPct < 16
        ? "translate(-12px, calc(-100% - 10px))"
        : "translate(-50%, calc(-100% - 10px))"
    : "translate(-50%, calc(-100% - 10px))";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Typography.Text type="secondary">
        Latest aggregate: <Typography.Text strong>{numberFormatter.format(latest.value)}</Typography.Text>
        {unit ? ` ${unit}` : ""}
      </Typography.Text>

      <div style={{ position: "relative" }}>
        <svg
          aria-label="Time series chart"
          ref={svgRef}
          style={{
            background:
              isDarkMode
                ? "linear-gradient(180deg, rgba(15, 23, 32, 0.9), rgba(21, 30, 42, 0.98))"
                : "linear-gradient(180deg, rgba(240, 248, 246, 0.55), rgba(255, 255, 255, 0.95))",
            border: isDarkMode ? "1px solid #2b3646" : "1px solid #d9d9d9",
            borderRadius: 12,
            height: 280,
            width: "100%",
          }}
        />
        {hoveredPoint ? (
          <div
            style={{
              background: isDarkMode ? "rgba(15, 23, 32, 0.96)" : "rgba(255, 255, 255, 0.96)",
              border: isDarkMode ? "1px solid #334155" : "1px solid #d9d9d9",
              borderRadius: 8,
              boxShadow: isDarkMode
                ? "0 6px 20px rgba(2, 6, 23, 0.45)"
                : "0 6px 18px rgba(15, 23, 42, 0.16)",
              color: isDarkMode ? "#e2e8f0" : "#1f2937",
              fontSize: 12,
              left: `${hoveredPoint.xPct}%`,
              maxWidth: 280,
              padding: "8px 10px",
              pointerEvents: "none",
              position: "absolute",
              top: `${hoveredPoint.yPct}%`,
              transform: tooltipTransform,
              zIndex: 5,
            }}
          >
            <div>{tooltipDateFormatter.format(hoveredPoint.ts)}</div>
            <div style={{ marginTop: 4 }}>
              Aggregate:{" "}
              <strong>{numberFormatter.format(hoveredPoint.value)}</strong>
              {unit ? ` ${unit}` : ""}
            </div>
            {hoveredPoint.assetValues.length ? (
              <div style={{ marginTop: 6 }}>
                {hoveredPoint.assetValues.map((assetValue) => (
                  <div
                    key={`${assetValue.assetId}-${assetValue.assetName}`}
                    style={{ alignItems: "center", display: "flex", gap: 6, marginTop: 2 }}
                  >
                    <span
                      style={{
                        background: assetValue.color,
                        borderRadius: "50%",
                        display: "inline-block",
                        height: 8,
                        width: 8,
                      }}
                    />
                    <span>{assetValue.assetName}:</span>
                    <strong>{numberFormatter.format(assetValue.value)}</strong>
                    <span>{unit ?? ""}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {assetLegend.length ? (
        <div>
          <Typography.Text type="secondary">Asset markers</Typography.Text>
          <Space size={[6, 6]} style={{ marginTop: 6 }} wrap>
            {assetLegend.map((asset) => (
              <Tag key={`${asset.assetId}-${asset.assetName}`}>
                <span
                  style={{
                    background: asset.color,
                    borderRadius: "50%",
                    display: "inline-block",
                    height: 8,
                    marginRight: 6,
                    width: 8,
                  }}
                />
                {asset.assetName}
              </Tag>
            ))}
          </Space>
        </div>
      ) : null}
    </div>
  );
}
