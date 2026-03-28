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

export function TimelineChart({ data }: { data: TimelinePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-zinc-500 text-sm">
        No data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradNeedsInfo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradUnknown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#71717a" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#71717a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="day"
          tickFormatter={formatDate}
          stroke="#52525b"
          tick={{ fontSize: 11, fill: "#71717a" }}
        />
        <YAxis stroke="#52525b" tick={{ fontSize: 11, fill: "#71717a" }} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={formatDate}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }}
        />
        <Area
          type="monotone"
          dataKey="resolved"
          stroke="#22c55e"
          fill="url(#gradResolved)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="needs_info"
          stroke="#eab308"
          fill="url(#gradNeedsInfo)"
          strokeWidth={2}
          name="needs info"
        />
        <Area
          type="monotone"
          dataKey="unknown"
          stroke="#71717a"
          fill="url(#gradUnknown)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
