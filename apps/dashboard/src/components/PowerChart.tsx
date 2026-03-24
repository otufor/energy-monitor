import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  useYAxisScale,
  useYAxisInverseScale,
  usePlotArea,
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

  // マウス操作で確定した任意範囲（ドライブ: 表示 + データフェッチ）
  const [freeRange, setFreeRange] = useState<[number, number] | null>(null);

  // ドラッグ中の表示用一時ドメイン（スムーズパン用・マウスアップで freeRange へコミット）
  const [viewDomain, setViewDomain] = useState<[number, number] | null>(null);

  // ドラッグ追跡
  const dragRef = useRef<{ startX: number; startDomain: [number, number] } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 閾値（デフォルト 3000W、localStorage 永続化）
  const [autoRefresh, setAutoRefresh] = useState(false);

  // 閾値（デフォルト 3000W、localStorage 永続化）
  const [threshold, setThreshold] = useState<number>(() => {
    const s = localStorage.getItem("powerChart.threshold");
    return s !== null ? Number(s) : 3000;
  });
  const [thresholdDragging, setThresholdDragging] = useState(false);

  // Y軸逆スケール（ThresholdLineInner 内から更新、閾値ドラッグで参照）
  const yInverseScaleRef = useRef<((px: number) => unknown) | null>(null);

  // ホイール/ドラッグイベント attach 先
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const isFreeMode = freeRange !== null;
  const isLive = !isFreeMode && anchorTime === null;

  // --- 期間モード用フェッチ ---
  const rangeFrom = useMemo(
    () => (!isFreeMode && !isLive ? subMinutes(anchorTime!, periodMinutes).toISOString() : ""),
    [isFreeMode, isLive, anchorTime, periodMinutes],
  );
  const rangeTo = useMemo(
    () => (!isFreeMode && !isLive ? anchorTime!.toISOString() : ""),
    [isFreeMode, isLive, anchorTime],
  );

  const {
    data: recentData,
    isLoading: recentLoading,
    isError: recentError,
  } = useRecentPower(periodMinutes, autoRefresh && isLive);
  const {
    data: rangeData,
    isLoading: rangeLoading,
    isError: rangeError,
  } = usePowerRange(rangeFrom, rangeTo, !isFreeMode && !isLive);

  // --- 任意範囲モード用フェッチ ---
  const freeFrom = useMemo(
    () => (isFreeMode ? new Date(freeRange![0]).toISOString() : ""),
    [isFreeMode, freeRange],
  );
  const freeTo = useMemo(
    () => (isFreeMode ? new Date(freeRange![1]).toISOString() : ""),
    [isFreeMode, freeRange],
  );
  const {
    data: freeData,
    isLoading: freeLoading,
    isError: freeError,
  } = usePowerRange(freeFrom, freeTo, isFreeMode);

  const data = isFreeMode ? freeData : isLive ? recentData : rangeData;
  const isLoading = isFreeMode ? freeLoading : isLive ? recentLoading : rangeLoading;
  const isError = isFreeMode ? freeError : isLive ? recentError : rangeError;

  const clearFree = () => {
    setFreeRange(null);
    setViewDomain(null);
  };

  const goBack = () => {
    clearFree();
    setAnchorTime((prev) => subMinutes(prev ?? new Date(), periodMinutes));
  };

  const goForward = () => {
    if (isLive || anchorTime === null) return;
    clearFree();
    const next = addMinutes(anchorTime, periodMinutes);
    setAnchorTime(next >= new Date() ? null : next);
  };

  const periodLabel = PERIODS.find((p) => p.value === periodMinutes)?.label ?? `${periodMinutes}分`;

  const title = isFreeMode
    ? `瞬時電力（任意: ${format(new Date(freeRange![0]), "MM/dd HH:mm")} 〜 ${format(new Date(freeRange![1]), "MM/dd HH:mm")}）`
    : isLive
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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            自動更新
          </label>
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
                clearFree();
                setAnchorTime(null);
              }}
              disabled={isLive}
              className="px-2 py-1 text-sm rounded border bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              現在
            </button>
            <button
              onClick={clearFree}
              disabled={!isFreeMode && viewDomain === null}
              className="px-2 py-1 text-sm rounded border hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              範囲リセット
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {PERIODS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => {
              clearFree();
              setPeriodMinutes(value);
            }}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              !isFreeMode && periodMinutes === value
                ? "bg-red-500 text-white border-red-500"
                : "hover:bg-gray-50"
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
          freeRange={freeRange}
          setFreeRange={setFreeRange}
          viewDomain={viewDomain}
          setViewDomain={setViewDomain}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          threshold={threshold}
          setThreshold={setThreshold}
          thresholdDragging={thresholdDragging}
          setThresholdDragging={setThresholdDragging}
          yInverseScaleRef={yInverseScaleRef}
          chartWrapperRef={chartWrapperRef}
          dragRef={dragRef}
        />
      )}
    </div>
  );
};

type ChartBodyProps = {
  chartData: Array<{ tsMs: number; watts: number; [key: string]: unknown }>;
  periodMinutes: number;
  freeRange: [number, number] | null;
  setFreeRange: (d: [number, number] | null) => void;
  viewDomain: [number, number] | null;
  setViewDomain: (d: [number, number] | null) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  threshold: number;
  setThreshold: (v: number) => void;
  thresholdDragging: boolean;
  setThresholdDragging: (v: boolean) => void;
  yInverseScaleRef: React.RefObject<((px: number) => unknown) | null>;
  chartWrapperRef: React.RefObject<HTMLDivElement | null>;
  dragRef: React.RefObject<{ startX: number; startDomain: [number, number] } | null>;
};

const ChartBody = ({
  chartData,
  periodMinutes,
  freeRange,
  setFreeRange,
  viewDomain,
  setViewDomain,
  isDragging,
  setIsDragging,
  threshold,
  setThreshold,
  thresholdDragging,
  setThresholdDragging,
  yInverseScaleRef,
  chartWrapperRef,
  dragRef,
}: ChartBodyProps) => {
  const currentDomain = useCallback((): [number, number] => {
    if (viewDomain) return viewDomain;
    if (freeRange) return freeRange;
    if (chartData.length > 0) return [chartData[0].tsMs, chartData[chartData.length - 1].tsMs];
    return [Date.now() - periodMinutes * 60_000, Date.now()];
  }, [viewDomain, freeRange, chartData, periodMinutes]);

  const getPlotWidth = useCallback((): number => {
    const el = chartWrapperRef.current;
    if (!el) return 600;
    return el.getBoundingClientRect().width - 60; // 60px = Y軸幅の近似
  }, [chartWrapperRef]);

  // ホイールズーム → viewDomain を即時更新、300ms 無操作後に freeRange へコミットしてフェッチ
  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [d0, d1] = currentDomain();
      const span = d1 - d0;
      const factor = e.deltaY > 0 ? 1.25 : 0.8;

      const rect = el.getBoundingClientRect();
      const plotLeft = rect.left + 60;
      const plotWidth = getPlotWidth();
      const ratio = Math.max(0, Math.min(1, (e.clientX - plotLeft) / plotWidth));

      const center = d0 + span * ratio;
      const newSpan = span * factor;
      const newDomain: [number, number] = [
        center - newSpan * ratio,
        center + newSpan * (1 - ratio),
      ];
      // ズーム中は表示のみ更新（フェッチしない）
      setViewDomain(newDomain);
      // 操作が止まったらフェッチを伴う任意範囲として確定
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setFreeRange(newDomain);
        setViewDomain(null);
        debounceTimer = null;
      }, 300);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
    };
  }, [currentDomain, getPlotWidth, chartWrapperRef, setFreeRange, setViewDomain]);

  // ドラッグパン（mousemove で viewDomain 更新、mouseup で freeRange へコミット）
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
        // ドラッグ完了 → 任意範囲モードへ移行してデータフェッチ
        const domain = currentDomain();
        setFreeRange(domain);
        setViewDomain(null);
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
    setFreeRange,
    setViewDomain,
    setIsDragging,
  ]);

  // 閾値ドラッグ
  useEffect(() => {
    if (!thresholdDragging) return;
    const onMove = (e: MouseEvent) => {
      const yInverseScale = yInverseScaleRef.current;
      const wrapper = chartWrapperRef.current;
      if (!yInverseScale || !wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const pixelY = e.clientY - rect.top;
      const val = Math.max(0, Math.round(yInverseScale(pixelY) as number));
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
  }, [thresholdDragging, yInverseScaleRef, chartWrapperRef, setThreshold, setThresholdDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || thresholdDragging) return;
    dragRef.current = { startX: e.clientX, startDomain: currentDomain() };
  };

  // 表示ドメイン: ドラッグ中 → viewDomain、任意範囲モード → freeRange、それ以外 → データ範囲
  const xDomain = viewDomain ?? freeRange ?? (["dataMin", "dataMax"] as const);

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
          <ThresholdLineInner
            threshold={threshold}
            setThresholdDragging={setThresholdDragging}
            yInverseScaleRef={yInverseScaleRef}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

type ThresholdLineInnerProps = {
  threshold: number;
  setThresholdDragging: (v: boolean) => void;
  yInverseScaleRef: React.RefObject<((px: number) => unknown) | null>;
};

// Recharts 3.x: <AreaChart> 直下に直接レンダリングすることでチャートコンテキストフックが使える
const ThresholdLineInner = ({
  threshold,
  setThresholdDragging,
  yInverseScaleRef,
}: ThresholdLineInnerProps) => {
  const yScale = useYAxisScale();
  const yInverseScale = useYAxisInverseScale();
  const plotArea = usePlotArea();

  // 逆スケールを ref に同期（閾値ドラッグハンドラから参照）
  if (yInverseScale) {
    yInverseScaleRef.current = yInverseScale as (px: number) => unknown;
  }

  if (!yScale || !plotArea) return null;

  const y = yScale(threshold);
  if (y === undefined || isNaN(y)) return null;

  const x1 = plotArea.x;
  const x2 = plotArea.x + plotArea.width;

  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#f39c12" strokeWidth={2} strokeDasharray="6 3" />
      <text x={x2 - 4} y={y - 4} textAnchor="end" fontSize={11} fill="#f39c12">
        {threshold}W
      </text>
      <rect
        x={x1}
        y={y - 8}
        width={plotArea.width}
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
};
