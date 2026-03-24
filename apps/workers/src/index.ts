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
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.route("/api", powerRouter);

// Dev only: manual trigger for scheduled collector
app.get("/dev/collect", async (c) => {
  try {
    await collector(c.env);
    return c.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    return c.json({ ok: false, error: msg }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(collector(env));
  },
};
