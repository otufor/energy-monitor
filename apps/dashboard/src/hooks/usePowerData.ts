import { useQuery } from "@tanstack/react-query";
import type { PowerLog, DailySummary } from "../types";

const API = import.meta.env.VITE_WORKERS_API_URL ?? "";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

const apiFetch = (url: string) =>
  fetch(url, { headers: { "X-Api-Key": API_KEY } }).then((r) => {
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    return r.json();
  });

export const useRecentPower = (minutes = 60, autoRefresh = false) =>
  useQuery<PowerLog[]>({
    queryKey: ["power", "recent", minutes],
    queryFn: () => apiFetch(`${API}/api/power/recent?minutes=${minutes}`),
    refetchInterval: autoRefresh ? 60_000 : false,
  });

export const usePowerRange = (from: string, to: string, enabled = true) =>
  useQuery<PowerLog[]>({
    queryKey: ["power", "range", from, to],
    queryFn: () =>
      apiFetch(
        `${API}/api/power/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled,
  });

export const useDailySummary = (date: string) =>
  useQuery<DailySummary>({
    queryKey: ["summary", date],
    queryFn: () => apiFetch(`${API}/api/summary/${date}`),
  });
