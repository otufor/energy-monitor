import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Customized,
} from "recharts";
import { format, subMinutes, addMinutes } from "date-fns";
import { useRecentPower, usePowerRange } from "../hooks/usePowerData";

const PERIODS = [
  { label: "30分", value: 30 },
  { label: "1時間", value: 60 },
  { label: "3時間", value: 180 },
  { label: "6時間", value: 360 },
  { label: "12時間", value: 720 },
  { label: "24時間", value: 1440 },
];

export const PowerChart = () => {
  const [periodMinutes, setPeriodMinutes] = useState(60);
  const [anchorTime, setAnchorTime] = useState<Date | null>(null); // null = ライブ

  // ズーム/パン表示域（null = データ範囲全体）
  const [viewDomain, setViewDomain] = useState<[number, number] | null>(null);

  // ドラッグ追跡
  const dragRef = useRef<{ startX: number; startDomain: [number, number] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 閾値（デフォルト 3000W、localStorage 永続化）
  const [threshold, setThreshold] = useState<number>(() => {
    const s = localStorage.getItem("powerChart.threshold");
    return s !== null ? Number(s) : 3000;
  });
  const [thresholdDragging, setThresholdDragging] = useState(false);

  // チャートレイアウト情報（Customized コンポーネントから取得）
  const chartOffsetRef = useRef<{ left: number; right: number; top: number } | null>(null);
  const yScaleRef = useRef<(((v: number) => number) & { invert: (px: number) => number }) | null>(
    null,
  );

  // ホイール/ドラッグイベント attach 先
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const isLive = anchorTime === null;

  const rangeFrom = useMemo(
    () => (isLive ? "" : subMinutes(anchorTime!, periodMinutes).toISOString()),
    [isLive, anchorTime, periodMinutes],
  );
  const rangeTo = useMemo(() => (isLive ? "" : anchorTime!.toISOString()), [isLive, anchorTime]);

  const {
    data: recentData,
    isLoading: recentLoading,
    isError: recentError,
  } = useRecentPower(periodMinutes);
  const {
    data: rangeData,
    isLoading: rangeLoading,
    isError: rangeError,
  } = usePowerRange(rangeFrom, rangeTo, !isLive);

  const data = isLive ? recentData : rangeData;
  const isLoading = isLive ? recentLoading : rangeLoading;
  const isError = isLive ? recentError : rangeError;

  const goBack = () => {
    setViewDomain(null);
    setAnchorTime((prev) => subMinutes(prev ?? new Date(), periodMinutes));
  };

  const goForward = () => {
    if (isLive) return;
    setViewDomain(null);
    const next = addMinutes(anchorTime!, periodMinutes);
    setAnchorTime(next >= new Date() ? null : next);
  };

  const periodLabel = PERIODS.find((p) => p.value === periodMinutes)?.label ?? `${periodMinutes}分`;

  const title = isLive
    ? `瞬時電力（直近${periodLabel}）`
    : `瞬時電力（${format(subMinutes(anchorTime!, periodMinutes), "MM/dd HH:mm")} 〜 ${format(anchorTime!, "MM/dd HH:mm")}）`;

  if (isLoading) {
    return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;
  }

  const chartData = (data ?? []).map((d) => ({
    ...d,
    tsMs: new Date(d.ts.replace(" ", "T") + "Z").getTime(),
  }));

  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={goBack}
            className="px-2 py-1 text-sm rounded border hover:bg-gray-50 active:bg-gray-100"
          >
            ← 前
          </button>
          <button
            onClick={goForward}
            disabled={isLive}
            className="px-2 py-1 text-sm rounded border hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            次 →
          </button>
          <button
            onClick={() => {
              setAnchorTime(null);
              setViewDomain(null);
            }}
            disabled={isLive}
            className="px-2 py-1 text-sm rounded border bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            現在
          </button>
          <button
            onClick={() => setViewDomain(null)}
            disabled={viewDomain === null}
            className="px-2 py-1 text-sm rounded border hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ズームリセット
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {PERIODS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => {
              setPeriodMinutes(value);
              setViewDomain(null);
            }}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              periodMinutes === value ? "bg-red-500 text-white border-red-500" : "hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isError || !data ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          データを取得できませんでした
        </div>
      ) : (
        <ChartBody
          chartData={chartData}
          periodMinutes={periodMinutes}
          viewDomain={viewDomain}
          setViewDomain={setViewDomain}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          threshold={threshold}
          setThreshold={setThreshold}
          thresholdDragging={thresholdDragging}
          setThresholdDragging={setThresholdDragging}
          chartOffsetRef={chartOffsetRef}
          yScaleRef={yScaleRef}
          chartWrapperRef={chartWrapperRef}
          dragRef={dragRef}
          setAnchorTime={setAnchorTime}
        />
      )}
    </div>
  );
};

type ChartBodyProps = {
  chartData: Array<{ tsMs: number; watts: number; [key: string]: unknown }>;
  periodMinutes: number;
  viewDomain: [number, number] | null;
  setViewDomain: (d: [number, number] | null) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  threshold: number;
  setThreshold: (v: number) => void;
  thresholdDragging: boolean;
  setThresholdDragging: (v: boolean) => void;
  chartOffsetRef: React.RefObject<{ left: number; right: number; top: number } | null>;
  yScaleRef: React.RefObject<(((v: number) => number) & { invert: (px: number) => number }) | null>;
  chartWrapperRef: React.RefObject<HTMLDivElement | null>;
  dragRef: React.RefObject<{ startX: number; startDomain: [number, number] } | null>;
  setAnchorTime: (t: Date | null) => void;
};

const ChartBody = ({
  chartData,
  periodMinutes,
  viewDomain,
  setViewDomain,
  isDragging,
  setIsDragging,
  threshold,
  setThreshold,
  thresholdDragging,
  setThresholdDragging,
  chartOffsetRef,
  yScaleRef,
  chartWrapperRef,
  dragRef,
  setAnchorTime,
}: ChartBodyProps) => {
  const currentDomain = useCallback((): [number, number] => {
    if (viewDomain) return viewDomain;
    if (chartData.length > 0) return [chartData[0].tsMs, chartData[chartData.length - 1].tsMs];
    return [Date.now() - periodMinutes * 60_000, Date.now()];
  }, [viewDomain, chartData, periodMinutes]);

  const getPlotWidth = useCallback((): number => {
    const el = chartWrapperRef.current;
    if (!el || !chartOffsetRef.current) return 600;
    return (
      el.getBoundingClientRect().width - chartOffsetRef.current.left - chartOffsetRef.current.right
    );
  }, [chartWrapperRef, chartOffsetRef]);

  // ホイールズーム（passive: false で addEventListener 直接使用）
  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [d0, d1] = currentDomain();
      const span = d1 - d0;
      const factor = e.deltaY > 0 ? 1.25 : 0.8;

      const rect = el.getBoundingClientRect();
      const plotLeft = rect.left + (chartOffsetRef.current?.left ?? 60);
      const plotWidth = getPlotWidth();
      const ratio = Math.max(0, Math.min(1, (e.clientX - plotLeft) / plotWidth));

      const center = d0 + span * ratio;
      const newSpan = span * factor;
      setViewDomain([center - newSpan * ratio, center + newSpan * (1 - ratio)]);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [currentDomain, getPlotWidth, chartWrapperRef, chartOffsetRef, setViewDomain]);

  // ドラッグパン（window で mousemove/mouseup を追跡）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      if (Math.abs(dx) < 3 && !isDragging) return;
      setIsDragging(true);
      const [d0, d1] = dragRef.current.startDomain;
      const dMs = -(dx / getPlotWidth()) * (d1 - d0);
      setViewDomain([d0 + dMs, d1 + dMs]);
    };
    const onUp = () => {
      if (isDragging) {
        const [, newMax] = currentDomain();
        setAnchorTime(new Date(newMax) < new Date() ? new Date(newMax) : null);
      }
      dragRef.current = null;
      setIsDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    isDragging,
    currentDomain,
    getPlotWidth,
    dragRef,
    setViewDomain,
    setIsDragging,
    setAnchorTime,
  ]);

  // 閾値ドラッグ
  useEffect(() => {
    if (!thresholdDragging) return;
    const onMove = (e: MouseEvent) => {
      const yScale = yScaleRef.current;
      const wrapper = chartWrapperRef.current;
      if (!yScale || !wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const pixelY = e.clientY - rect.top - (chartOffsetRef.current?.top ?? 5);
      const val = Math.max(0, Math.round(yScale.invert(pixelY)));
      setThreshold(val);
      localStorage.setItem("powerChart.threshold", String(val));
    };
    const onUp = () => setThresholdDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    thresholdDragging,
    yScaleRef,
    chartWrapperRef,
    chartOffsetRef,
    setThreshold,
    setThresholdDragging,
  ]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || thresholdDragging) return;
    dragRef.current = { startX: e.clientX, startDomain: currentDomain() };
  };

  const ThresholdLine = useCallback(
    (props: {
      yAxisMap?: Record<
        string,
        { scale: ((v: number) => number) & { invert: (px: number) => number } }
      >;
      offset?: { left: number; right: number; top: number; width: number; height: number };
    }) => {
      const { yAxisMap, offset } = props;
      if (!yAxisMap || !offset) return null;
      const yScale = Object.values(yAxisMap)[0]?.scale;
      if (!yScale) return null;

      chartOffsetRef.current = { left: offset.left, right: offset.right ?? 5, top: offset.top };
      yScaleRef.current = yScale;

      const y = yScale(threshold);
      if (isNaN(y)) return null;
      const x1 = offset.left;
      const x2 = offset.left + offset.width;

      return (
        <g>
          <line
            x1={x1}
            y1={y}
            x2={x2}
            y2={y}
            stroke="#f39c12"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
          <text x={x2 - 4} y={y - 4} textAnchor="end" fontSize={11} fill="#f39c12">
            {threshold}W
          </text>
          <rect
            x={x1}
            y={y - 8}
            width={offset.width}
            height={16}
            fill="transparent"
            style={{ cursor: "ns-resize" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setThresholdDragging(true);
            }}
          />
        </g>
      );
    },
    [threshold, chartOffsetRef, yScaleRef, setThresholdDragging],
  );

  const xDomain = viewDomain ?? (["dataMin", "dataMax"] as const);

  return (
    <div
      ref={chartWrapperRef}
      onMouseDown={handleMouseDown}
      style={{
        cursor: thresholdDragging ? "ns-resize" : isDragging ? "grabbing" : "default",
        userSelect: "none",
      }}
    >
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="tsMs"
            type="number"
            scale="time"
            domain={xDomain}
            tickFormatter={(v) =>
              format(new Date(v as number), periodMinutes >= 1440 ? "MM/dd HH:mm" : "HH:mm")
            }
            tick={{ fontSize: 12 }}
          />
          <YAxis unit="W" tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(v) => format(new Date(v as number), "MM/dd HH:mm:ss")}
            formatter={((v: number) => `${v} W`) as never}
            active={isDragging ? false : undefined}
          />
          <Area
            type="linear"
            dataKey="watts"
            stroke="#e74c3c"
            fill="#e74c3c"
            fillOpacity={0.15}
            strokeWidth={1.5}
          />
          <Customized component={ThresholdLine} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
