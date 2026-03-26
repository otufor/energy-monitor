import { useQuery } from "@tanstack/react-query";
import type { PowerLog, DailySummary } from "../types";

const API = import.meta.env.VITE_WORKERS_API_URL ?? "";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

/** X-Api-Key ヘッダーを付与してフェッチし、非 2xx の場合は Error をスローする */
const apiFetch = (url: string) =>
  fetch(url, { headers: API_KEY ? { "X-Api-Key": API_KEY } : undefined }).then((r) => {
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    return r.json();
  });

/** 直近 N 分間の電力ログを取得する。autoRefresh が true の場合は 60 秒ごとに再取得する */
export const useRecentPower = (minutes = 60, autoRefresh = false) =>
  useQuery<PowerLog[]>({
    queryKey: ["power", "recent", minutes],
    queryFn: () => apiFetch(`${API}/api/power/recent?minutes=${minutes}`),
    refetchInterval: autoRefresh ? 60_000 : false,
  });

/** 指定した UTC 時刻範囲の電力ログを取得する */
export const usePowerRange = (from: string, to: string, enabled = true) =>
  useQuery<PowerLog[]>({
    queryKey: ["power", "range", from, to],
    queryFn: () =>
      apiFetch(
        `${API}/api/power/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled,
  });

/** 指定した日付（YYYY-MM-DD）の日次サマリーを取得する */
export const useDailySummary = (date: string) =>
  useQuery<DailySummary>({
    queryKey: ["summary", date],
    queryFn: () => apiFetch(`${API}/api/summary/${date}`),
  });
