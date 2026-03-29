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

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://energy-monitor.pages.dev",
  "https://energy-monitor-notebook.mh076144.workers.dev",
];

const isPagesPreviewOrigin = (origin: string) => /^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(origin);

const isAllowedOrigin = (origin: string, allowed: string[]) =>
  allowed.includes(origin) || isPagesPreviewOrigin(origin);

export const createApp = () => {
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

  // CORS: 環境変数 ALLOWED_ORIGINS (カンマ区切り) で制限。未設定時は既知の UI と Pages preview を許可する。
  app.use("*", async (c, next) => {
    const configured = (c.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    const allowed = configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
    return cors({
      origin: (origin) => {
        if (!origin) return "";
        return isAllowedOrigin(origin, allowed) ? origin : "";
      },
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-Api-Key"],
    })(c, next);
  });

  // 読み取り API は公開し、書き込み系だけ API キーで保護する。
  app.use("/api/*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return next();
    }

    if (c.req.method === "GET") {
      return next();
    }

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

  return app;
};

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(collector(env));
  },
};
