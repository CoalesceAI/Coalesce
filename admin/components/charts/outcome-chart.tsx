"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface OutcomeData {
  resolved: number;
  needs_info: number;
  unknown: number;
  active: number;
}

const COLORS = {
  resolved: "#22c55e",
  "needs info": "#eab308",
  unknown: "#71717a",
  active: "#3b82f6",
};

export function OutcomeChart({ data }: { data: OutcomeData }) {
  const chartData = [
    { name: "resolved", value: data.resolved },
    { name: "needs info", value: data.needs_info },
    { name: "unknown", value: data.unknown },
    { name: "active", value: data.active },
  ].filter((d) => d.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-zinc-500 text-sm">
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
              fill={COLORS[entry.name as keyof typeof COLORS]}
              stroke="transparent"
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
