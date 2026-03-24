import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { Hono } from "hono";
import { powerRouter } from "../src/api";
import type { Env } from "../src/index";

// D1Database のモック
const mockD1 = {
  prepare: vi.fn(),
};

const makeEnv = (overrides?: Partial<Env>): Env => ({
  DB: mockD1 as unknown as D1Database,
  R2: {} as R2Bucket,
  NATURE_TOKEN: "test-token",
  LINE_TOKEN: "test-line-token",
  COST_PER_KWH: "30",
  ALERT_THRESHOLD_WATTS: "3000",
  ...overrides,
});

const makeApp = (env: Env) => {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api", powerRouter);
  return (path: string, init?: RequestInit) =>
    app.fetch(new Request(`http://localhost${path}`, init), env);
};

describe("GET /api/power/recent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("直近の電力ログを返す", async () => {
    const mockRows = [
      { ts: "2025-01-01 00:01:00", watts: 800, ampere: 3.5, cum_raw: 1001, cum_kwh: 100.1 },
      { ts: "2025-01-01 00:02:00", watts: 850, ampere: 3.7, cum_raw: 1002, cum_kwh: 100.2 },
    ];
    mockD1.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockRows }),
      }),
    });

    const res = await makeApp(makeEnv())("/api/power/recent?minutes=60");
    expect(res.status).toBe(200);

    const json = (await res.json()) as Array<{ watts: number }>;
    expect(json).toHaveLength(2);
    expect(json[0].watts).toBe(800);
  });

  it("minutes パラメータのデフォルト値は 60", async () => {
    mockD1.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    });

    const res = await makeApp(makeEnv())("/api/power/recent");
    expect(res.status).toBe(200);

    const bindArg = mockD1.prepare().bind.mock.calls[0][0];
    expect(bindArg).toBe(-60);
  });
});

describe("GET /api/summary/:date", () => {
  beforeEach(() => vi.clearAllMocks());

  it("日次サマリーを返す", async () => {
    const mockRow = {
      date: "2025-01-01",
      total_kwh: 12.5,
      peak_watts: 2200,
      peak_time: "2025-01-01 18:30:00",
      avg_watts: 520,
    };
    mockD1.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(mockRow),
      }),
    });

    const res = await makeApp(makeEnv())("/api/summary/2025-01-01");
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, number>;
    expect(json.total_kwh).toBe(12.5);
    expect(json.cost_yen).toBe(375); // 12.5 * 30
    expect(json.peak_watts).toBe(2200);
  });

  it("データなしは 404 を返す", async () => {
    mockD1.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    });

    const res = await makeApp(makeEnv())("/api/summary/2025-01-01");
    expect(res.status).toBe(404);
  });

  it("COST_PER_KWH 設定が電気代計算に反映される", async () => {
    mockD1.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          date: "2025-01-01",
          total_kwh: 10,
          peak_watts: 1000,
          peak_time: "2025-01-01 12:00:00",
          avg_watts: 400,
        }),
      }),
    });

    const res = await makeApp(makeEnv({ COST_PER_KWH: "40" }))("/api/summary/2025-01-01");
    const json = (await res.json()) as Record<string, number>;
    expect(json.cost_yen).toBe(400); // 10 * 40
  });
});
