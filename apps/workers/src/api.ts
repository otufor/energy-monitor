import { Hono } from "hono";
import type { Env } from "./index";
import type { PowerLog, DailySummary } from "@energy-monitor/types";

export const powerRouter = new Hono<{ Bindings: Env }>();

// 直近 N 分の電力ログ
powerRouter.get("/power/recent", async (c) => {
  const minutes = parseInt(c.req.query("minutes") ?? "60");
  if (isNaN(minutes) || minutes < 1 || minutes > 10080) {
    return c.json({ error: "minutes must be between 1 and 10080" }, 400);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT ts, watts, ampere, cum_raw, cum_kwh FROM power_log
     WHERE ts >= datetime('now', ? || ' minutes')
     ORDER BY ts ASC`,
  )
    .bind(-minutes)
    .all<PowerLog>();

  return c.json(results);
});

// 時刻範囲の電力ログ (from/to は UTC ISO 文字列)
powerRouter.get("/power/range", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) return c.json({ error: "from and to are required" }, 400);

  const isValidISO = (s: string) => !isNaN(Date.parse(s));
  if (!isValidISO(from) || !isValidISO(to)) {
    return c.json({ error: "from and to must be valid ISO 8601 date strings" }, 400);
  }

  const toDb = (iso: string) =>
    iso
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, "")
      .replace("Z", "");

  const { results } = await c.env.DB.prepare(
    `SELECT ts, watts, ampere, cum_raw, cum_kwh FROM power_log
     WHERE ts >= ? AND ts <= ?
     ORDER BY ts ASC`,
  )
    .bind(toDb(from), toDb(to))
    .all<PowerLog>();

  return c.json(results);
});

// 日次サマリー
powerRouter.get("/summary/:date", async (c) => {
  const date = c.req.param("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "date must be in YYYY-MM-DD format" }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT
       ? AS date,
       ROUND(COALESCE(MAX(cum_kwh) - MIN(cum_kwh), 0), 3)      AS total_kwh,
       MAX(watts)                                              AS peak_watts,
       (SELECT ts FROM power_log
        WHERE date(ts, '+9 hours') = ? ORDER BY watts DESC LIMIT 1) AS peak_time,
       ROUND(AVG(watts), 1)                                    AS avg_watts
     FROM power_log
     WHERE date(ts, '+9 hours') = ?`,
  )
    .bind(date, date, date)
    .first<Omit<DailySummary, "cost_yen">>();

  if (!row) return c.json({ error: "No data" }, 404);

  const costPerKwh = parseFloat(c.env.COST_PER_KWH);
  return c.json({ ...row, cost_yen: Math.round(row.total_kwh * costPerKwh) });
});

// 日次 CSV → R2 へ保存
powerRouter.post("/export/daily", async (c) => {
  const { date } = await c.req.json<{ date: string }>();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "date must be in YYYY-MM-DD format" }, 400);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT ts, watts, ampere, cum_raw, cum_kwh FROM power_log
     WHERE date(ts, '+9 hours') = ? ORDER BY ts ASC`,
  )
    .bind(date)
    .all<PowerLog>();

  const csv = [
    "ts,watts,ampere,cum_raw,cum_kwh",
    ...results.map((r) => `${r.ts},${r.watts},${r.ampere},${r.cum_raw},${r.cum_kwh}`),
  ].join("\n");

  if (!c.env.R2) return c.json({ error: "R2 binding is not configured" }, 503);
  await c.env.R2.put(`daily/${date}.csv`, csv, {
    httpMetadata: { contentType: "text/csv" },
  });

  return c.json({ ok: true, rows: results.length });
});
