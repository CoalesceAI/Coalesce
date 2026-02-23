"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type UTCTimestamp,
  ColorType,
  CandlestickSeries,
} from "lightweight-charts";
import type { CandlestickData } from "@/types/market";
import { useTheme } from "next-themes";

interface PriceChartProps {
  candlesticks: CandlestickData[];
}

export function PriceChart({ candlesticks }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = resolvedTheme === "dark";

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#a1a1aa" : "#71717a",
      },
      grid: {
        vertLines: { color: isDark ? "#27272a" : "#f4f4f5" },
        horzLines: { color: isDark ? "#27272a" : "#f4f4f5" },
      },
      width: containerRef.current.clientWidth,
      height: 360,
      rightPriceScale: {
        borderColor: isDark ? "#27272a" : "#e4e4e7",
      },
      timeScale: {
        borderColor: isDark ? "#27272a" : "#e4e4e7",
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });

    if (candlesticks.length > 0) {
      const data = candlesticks.map((c) => ({
        time: c.end_period_ts as UTCTimestamp,
        open: c.price.open,
        high: c.price.high,
        low: c.price.low,
        close: c.price.close,
      }));
      candleSeries.setData(data);
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [candlesticks, resolvedTheme]);

  if (candlesticks.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return <div ref={containerRef} />;
}
