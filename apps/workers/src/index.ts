import { Hono } from "hono";
import { cors } from "hono/cors";
import { collector } from "./collector";
import { powerRouter } from "./api";

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  NATURE_TOKEN: string;
  LINE_TOKEN: string;
  COST_PER_KWH: string;
  ALERT_THRESHOLD_WATTS: string;
  API_KEY: string;
  ALLOWED_ORIGINS: string;
}

const app = new Hono<{ Bindings: Env }>();

// セキュリティヘッダー
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Content-Security-Policy", "default-src 'none'");
  c.header("Referrer-Policy", "no-referrer");
});

// CORS: 環境変数 ALLOWED_ORIGINS (カンマ区切り) で制限
app.use("*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return cors({
    origin: allowed.length > 0 ? allowed : [],
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type", "X-Api-Key"],
  })(c, next);
});

// API キー認証ミドルウェア
app.use("/api/*", async (c, next) => {
  const key = c.req.header("X-Api-Key");
  if (!c.env.API_KEY || key !== c.env.API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

app.route("/api", powerRouter);

// Dev only: manual trigger for scheduled collector (API キー認証必須)
app.get("/dev/collect", async (c) => {
  const key = c.req.header("X-Api-Key");
  if (!c.env.API_KEY || key !== c.env.API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    await collector(c.env);
    return c.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: msg }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(collector(env));
  },
};
