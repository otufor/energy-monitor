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
  API_KEY: "",
  ALLOWED_ORIGINS: "",
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

describe("GET /api/power/recent バリデーション", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [0, "最小値未満"],
    [-1, "負の値"],
    [10081, "最大値超過"],
  ])("minutes=%i (%s) は 400 を返す", async (minutes) => {
    const res = await makeApp(makeEnv())(`/api/power/recent?minutes=${minutes}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/power/range", () => {
  beforeEach(() => vi.clearAllMocks());

  it("from と to を指定すると対応する期間のデータを返す", async () => {
    const mockRows = [
      { ts: "2025-01-01 00:01:00", watts: 800, ampere: 3.5, cum_raw: 1001, cum_kwh: 100.1 },
    ];
    mockD1.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockRows }),
      }),
    });

    const res = await makeApp(makeEnv())(
      "/api/power/range?from=2025-01-01T00:00:00Z&to=2025-01-01T01:00:00Z",
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Array<{ watts: number }>;
    expect(json).toHaveLength(1);
    expect(json[0].watts).toBe(800);
  });

  it("from が未指定の場合は 400 を返す", async () => {
    const res = await makeApp(makeEnv())("/api/power/range?to=2025-01-01T01:00:00Z");
    expect(res.status).toBe(400);
  });

  it("to が未指定の場合は 400 を返す", async () => {
    const res = await makeApp(makeEnv())("/api/power/range?from=2025-01-01T00:00:00Z");
    expect(res.status).toBe(400);
  });

  it("from が不正な日付文字列の場合は 400 を返す", async () => {
    const res = await makeApp(makeEnv())(
      "/api/power/range?from=not-a-date&to=2025-01-01T01:00:00Z",
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/summary/:date バリデーション", () => {
  beforeEach(() => vi.clearAllMocks());

  it("date が YYYY-MM-DD 形式でない場合は 400 を返す", async () => {
    const res = await makeApp(makeEnv())("/api/summary/2025-1-1");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/export/daily", () => {
  beforeEach(() => vi.clearAllMocks());

  it("指定した日付のデータを CSV として R2 に保存する", async () => {
    const mockRows = [
      { ts: "2025-01-01 00:01:00", watts: 800, ampere: 3.5, cum_raw: 1001, cum_kwh: 100.1 },
    ];
    mockD1.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: mockRows }),
      }),
    });
    const mockPut = vi.fn().mockResolvedValue(undefined);
    const env = makeEnv({ R2: { put: mockPut } as unknown as R2Bucket });

    const res = await makeApp(env)("/api/export/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2025-01-01" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; rows: number };
    expect(json.ok).toBe(true);
    expect(json.rows).toBe(1);
    expect(mockPut).toHaveBeenCalledWith("daily/2025-01-01.csv", expect.stringContaining("800"), {
      httpMetadata: { contentType: "text/csv" },
    });
  });

  it("date が未指定の場合は 400 を返す", async () => {
    const res = await makeApp(makeEnv())("/api/export/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
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
