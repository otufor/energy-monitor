#!/usr/bin/env node
/**
 * wrangler dev と組み合わせて毎分 /dev/collect を叩くスクリプト。
 * Usage: node scripts/trigger-cron.mjs [port]
 */
const port = process.argv[2] ?? "8787";
const url = `http://localhost:${port}/dev/collect`;

async function trigger() {
  try {
    const res = await fetch(url);
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
