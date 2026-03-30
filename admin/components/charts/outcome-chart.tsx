"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface OutcomeData {
  resolved: number;
  needs_info: number;
  unknown: number;
  active: number;
}

function cssVar(name: string) {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function useChartPalette() {
  const resolved = `oklch(${cssVar("--chart-2") || "0.627 0.194 149.57"})`;
  const needsInfo = `oklch(${cssVar("--chart-3") || "0.547 0.021 43.1"})`;
  const unknown = `oklch(${cssVar("--chart-4") || "0.714 0.014 41.2"})`;
  const active = `oklch(${cssVar("--chart-1") || "0.367 0.016 35.7"})`;
  const card = `oklch(${cssVar("--card") || "0.214 0.009 43.1"})`;
  const border = `oklch(${cssVar("--border") || "1 0 0 / 10%"})`;
  const cardFg = `oklch(${cssVar("--card-foreground") || "0.96 0.002 17.2"})`;
  return { resolved, needsInfo, unknown, active, card, border, cardFg };
}

const SERIES_MAP: Record<string, "resolved" | "needsInfo" | "unknown" | "active"> = {
  resolved: "resolved",
  "needs info": "needsInfo",
  unknown: "unknown",
  active: "active",
};

export function OutcomeChart({ data }: { data: OutcomeData }) {
  const c = useChartPalette();

  const chartData = [
    { name: "resolved", value: data.resolved },
    { name: "needs info", value: data.needs_info },
    { name: "unknown", value: data.unknown },
    { name: "active", value: data.active },
  ].filter((d) => d.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
        >
          {chartData.map((entry) => (
            <Cell
              key={entry.name}
              fill={c[SERIES_MAP[entry.name] ?? "unknown"]}
              stroke={c.card}
              strokeWidth={2}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: c.card,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
          itemStyle={{ color: c.cardFg }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
