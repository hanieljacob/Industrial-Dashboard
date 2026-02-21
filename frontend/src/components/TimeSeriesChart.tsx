import { useEffect, useMemo, useRef } from "react";
import { Empty, Typography } from "antd";
import * as d3 from "d3";

import type { TimeSeriesPoint } from "../types";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

type TimeSeriesChartProps = {
  points: TimeSeriesPoint[];
  unit: string | null;
};

type ChartDatum = {
  ts: Date;
  value: number;
};

export default function TimeSeriesChart({ points, unit }: TimeSeriesChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const data = useMemo<ChartDatum[]>(
    () =>
      points
        .map((point) => ({ ts: new Date(point.ts), value: point.value }))
        .filter((point) => !Number.isNaN(point.ts.getTime()))
        .sort((a, b) => a.ts.getTime() - b.ts.getTime()),
    [points],
  );

  useEffect(() => {
    if (!svgRef.current || data.length === 0) {
      return;
    }

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

    const maxValue = d3.max(data, (d) => d.value) ?? 0;
    const minValue = d3.min(data, (d) => d.value) ?? 0;

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
      .call((g) => g.selectAll("line").attr("stroke", "#d8ddd8").attr("stroke-dasharray", "4 4"));

    chartRoot
      .append("g")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickFormat((value) => numberFormatter.format(Number(value))),
      )
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("text").attr("fill", "#5f6b66"));

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
      .call((g) => g.select(".domain").attr("stroke", "#c8cec9"))
      .call((g) => g.selectAll("line").attr("stroke", "#c8cec9"))
      .call((g) => g.selectAll("text").attr("fill", "#6a746f"));

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
      .attr("fill", "rgba(31, 123, 105, 0.18)")
      .attr("d", areaGenerator);

    chartRoot
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#1f7b69")
      .attr("stroke-linecap", "round")
      .attr("stroke-width", 3)
      .attr("d", lineGenerator);

    const last = data[data.length - 1];
    chartRoot
      .append("circle")
      .attr("cx", xScale(last.ts))
      .attr("cy", yScale(last.value))
      .attr("fill", "#1f7b69")
      .attr("r", 4.5)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);
  }, [data]);

  if (data.length === 0) {
    return <Empty description="No points available for the selected metric" />;
  }

  const latest = data[data.length - 1];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Typography.Text type="secondary">
        Latest: <Typography.Text strong>{numberFormatter.format(latest.value)}</Typography.Text>
        {unit ? ` ${unit}` : ""}
      </Typography.Text>

      <svg
        aria-label="Time series chart"
        ref={svgRef}
        style={{
          background:
            "linear-gradient(180deg, rgba(240, 248, 246, 0.55), rgba(255, 255, 255, 0.95))",
          border: "1px solid #d9d9d9",
          borderRadius: 12,
          height: 280,
          width: "100%",
        }}
      />
    </div>
  );
}
