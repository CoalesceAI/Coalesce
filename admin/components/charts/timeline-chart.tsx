"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TimelinePoint {
  day: string;
  total: number;
  resolved: number;
  needs_info: number;
  unknown: number;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function cssVar(name: string) {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function useChartColors() {
  const resolved = `oklch(${cssVar("--chart-2") || "0.627 0.194 149.57"})`;
  const needsInfo = `oklch(${cssVar("--chart-3") || "0.547 0.021 43.1"})`;
  const unknown = `oklch(${cssVar("--chart-4") || "0.714 0.014 41.2"})`;
  const border = `oklch(${cssVar("--border") || "1 0 0 / 10%"})`;
  const muted = `oklch(${cssVar("--muted-foreground") || "0.547 0.021 43.1"})`;
  const card = `oklch(${cssVar("--card") || "0.214 0.009 43.1"})`;
  const cardFg = `oklch(${cssVar("--card-foreground") || "0.96 0.002 17.2"})`;
  return { resolved, needsInfo, unknown, border, muted, card, cardFg };
}

export function TimelineChart({ data }: { data: TimelinePoint[] }) {
  const c = useChartColors();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
        No data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c.resolved} stopOpacity={0.25} />
            <stop offset="95%" stopColor={c.resolved} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradNeedsInfo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c.needsInfo} stopOpacity={0.25} />
            <stop offset="95%" stopColor={c.needsInfo} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradUnknown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={c.unknown} stopOpacity={0.25} />
            <stop offset="95%" stopColor={c.unknown} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={c.border} />
        <XAxis
          dataKey="day"
          tickFormatter={formatDate}
          stroke="transparent"
          tick={{ fontSize: 11, fill: c.muted }}
        />
        <YAxis
          stroke="transparent"
          tick={{ fontSize: 11, fill: c.muted }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
          labelStyle={{ color: c.cardFg, marginBottom: 4 }}
          labelFormatter={(label) => formatDate(String(label))}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: c.muted }} />
        <Area
          type="monotone"
          dataKey="resolved"
          stroke={c.resolved}
          fill="url(#gradResolved)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="needs_info"
          stroke={c.needsInfo}
          fill="url(#gradNeedsInfo)"
          strokeWidth={2}
          name="needs info"
        />
        <Area
          type="monotone"
          dataKey="unknown"
          stroke={c.unknown}
          fill="url(#gradUnknown)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
