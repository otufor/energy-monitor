import { useQuery } from "@tanstack/react-query";
import type { PowerLog, DailySummary } from "../types";

const API = import.meta.env.VITE_WORKERS_API_URL ?? "";

export const useRecentPower = (minutes = 60) =>
  useQuery<PowerLog[]>({
    queryKey: ["power", "recent", minutes],
    queryFn: () => fetch(`${API}/api/power/recent?minutes=${minutes}`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

export const usePowerRange = (from: string, to: string, enabled = true) =>
  useQuery<PowerLog[]>({
    queryKey: ["power", "range", from, to],
    queryFn: () =>
      fetch(
        `${API}/api/power/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ).then((r) => r.json()),
    enabled,
  });

export const useDailySummary = (date: string) =>
  useQuery<DailySummary>({
    queryKey: ["summary", date],
    queryFn: () => fetch(`${API}/api/summary/${date}`).then((r) => r.json()),
  });
