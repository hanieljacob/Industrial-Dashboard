# Industrial Dashboard: Decisions and Development Notes

## 1) Project Goal
- Build a real-time-style industrial dashboard that is simple, reliable, and easy to reason about.
- Show two things clearly:
- Current plant status as prominent summary metrics.
- A time-series view so operators can see recent trends.

## 2) Product Principles
- Prioritize operational clarity over visual complexity.
- Favor predictable behavior and debuggability.
- Keep the first version practical: strong fundamentals before advanced infrastructure.

## 3) Backend Design Decisions
- Use a relational database as the source of truth for facilities, assets, metrics, and sensor readings.
- Keep data retrieval logic explicit and filter-driven so time ranges and facility scope are always controlled.
- Separate “current status” from “historical trend” workloads:
- Current status is treated as a snapshot question.
- Trend data is treated as a time-window question.

## 4) API Design Decisions
- Expose dedicated endpoints for:
- Facility metadata and selection.
- Dashboard summary (current snapshot).
- Time-series readings (historical trend).
- Apply response-size safeguards to prevent oversized payloads from destabilizing the UI and API.
- Add cache-friendly behavior for summary responses so unchanged data can return lightweight “not modified” responses.

## 5) Auto-Refresh Strategy Decision
- Chosen approach: short polling at a fixed interval.
- Why this was chosen:
- Simple to implement and reason about.
- Works well through common proxies/load balancers.
- Easier operationally than persistent connection strategies.
- Tradeoff accepted:
- Some repeated requests when no data changes.
- Mitigation:
- Conditional responses reduce payload when data has not changed.
- Incremental fetch patterns reduce repeated transfer of the same rows.

## 6) Alternatives Considered
- Long polling:
- Better immediacy than fixed polling in some cases, but adds request lifecycle complexity and connection management overhead.
- Server-Sent Events (SSE):
- Good for push updates, but introduces persistent-connection considerations, fan-out scaling concerns, and more operational tuning.
- Decision outcome:
- Keep short polling for now, optimize query and payload behavior first, then revisit push-based delivery if product needs change.

## 7) Duplicate-Data and Query Efficiency Decisions
- Avoid repeatedly sending the same time-series rows during refresh cycles.
- Use incremental retrieval semantics so clients can ask for “newer than last seen” data.
- Keep time-window filters as the primary guardrail for relevance and query performance.
- Ensure deterministic ordering so clients can merge updates safely.

## 8) Dashboard Summary Semantics
- Clarified that summary cards represent the latest snapshot, not full historical aggregation.
- This avoids confusion between:
- “Current total” (latest known state across assets).
- “Historical consumption” (requires integrating values over time).

## 9) Frontend Decisions
- Single-page layout with three operator tasks in mind:
- Select context (facility/asset/time range).
- Read current status quickly.
- Inspect trend changes over time.
- Auto-refresh is user-controllable.
- Visual language emphasizes scanability:
- Large key numbers for summary.
- A trend chart for temporal behavior.
- Clear labels to distinguish snapshot values vs trend values.

## 10) Scalability Direction (Planned)
- For very large historical windows, add database-level downsampling/bucketing to cap chart points.
- Dynamically choose bucket granularity by selected time range.
- Consider pre-aggregation strategies if usage grows (materialized rollups, periodic aggregates).
- Maintain separate optimizations for:
- Real-time-ish summary freshness.
- Heavy historical analytics.

## 11) Tradeoffs Accepted
- Simplicity and reliability were prioritized over lowest-latency push architecture in v1.
- A capped response size is safer for UI performance, with a roadmap toward richer aggregation/downsampling for larger datasets.

## 12) Development Process Notes
- Started from core user outcomes: “What is happening now?” and “How has it changed recently?”
- Implemented a baseline end-to-end flow first, then improved incrementally:
- Clarified data semantics.
- Reduced redundant payloads.
- Improved caching behavior.
- Improved UI wording to reduce operator confusion.
- Used iterative decision-making:
- Choose simplest workable approach.
- Measure bottlenecks.
- Add complexity only where it provides clear value.

## 13) Next Decision Checkpoints
- Define target freshness by metric type (seconds vs minutes).
- Define acceptable chart-point budgets per screen size.
- Decide when to introduce server-side bucketing by default.
- Re-evaluate push-based transport only if polling no longer meets latency or efficiency goals.

