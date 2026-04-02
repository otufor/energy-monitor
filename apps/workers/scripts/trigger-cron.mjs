#!/usr/bin/env node
/**
 * wrangler dev と組み合わせて毎分 /dev/collect を叩くスクリプト。
 * Usage: node scripts/trigger-cron.mjs [port]
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.argv[2] ?? "8787";
const url = `http://localhost:${port}/dev/collect`;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const devVarsPath = resolve(scriptDir, "../.dev.vars");

const readDevVar = (key) => {
  if (!existsSync(devVarsPath)) return undefined;

  const lines = readFileSync(devVarsPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const name = trimmed.slice(0, index).trim();
    if (name !== key) continue;
    return trimmed.slice(index + 1).trim();
  }
  return undefined;
};

const apiKey = process.env.DEV_API_KEY ?? process.env.API_KEY ?? readDevVar("API_KEY");

if (!apiKey) {
  console.error(
    "[cron] API_KEY が見つかりません。.dev.vars に API_KEY を設定するか、DEV_API_KEY を渡してください。",
  );
  process.exit(1);
}

async function trigger() {
  try {
    const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    const json = await res.json();
    console.log(`[cron] ${new Date().toISOString()} → ${JSON.stringify(json)}`);
  } catch (e) {
    console.error(`[cron] ${new Date().toISOString()} → failed: ${e.message}`);
  }
}

// 次の整数分まで待ってから毎分実行
const now = new Date();
const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

console.log(`[cron] 起動 - ${Math.round(msToNextMinute / 1000)}秒後に初回実行、以降毎分`);

let inFlight = false;

const tick = async () => {
  if (inFlight) return;
  inFlight = true;
  try {
    await trigger();
  } finally {
    inFlight = false;
  }
};

setTimeout(() => {
  void tick();
  setInterval(() => {
    void tick();
  }, 60_000);
}, msToNextMinute);
