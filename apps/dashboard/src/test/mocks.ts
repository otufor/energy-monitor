import type { PowerLog, DailySummary } from "../../src/types";

export const mockPowerLogs: PowerLog[] = [
  { ts: "2025-01-01T00:01:00Z", watts: 800, ampere: 3.5, cum_raw: 1001, cum_kwh: 100.1 },
  { ts: "2025-01-01T00:02:00Z", watts: 850, ampere: 3.7, cum_raw: 1002, cum_kwh: 100.2 },
  { ts: "2025-01-01T00:03:00Z", watts: 2800, ampere: 12.2, cum_raw: 1003, cum_kwh: 100.3 },
];

export const mockDailySummary: DailySummary = {
  date: "2025-01-01",
  total_kwh: 12.5,
  peak_watts: 2800,
  peak_time: "2025-01-01T00:03:00Z",
  avg_watts: 520,
  cost_yen: 375,
};
