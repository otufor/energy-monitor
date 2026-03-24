import type { Env } from "./index";
import type { NatureRemoAppliance } from "@energy-monitor/types";
import { unitFactor } from "@energy-monitor/types";

// ECHONET Lite プロパティコード
const EPC_WATTS = 0xe7; // 231: 瞬時電力計測値 (W)
const EPC_AMPERE = 0xe8; // 232: 瞬時電流計測値 (A×10)
const EPC_CUM_FORWARD = 0xe0; // 224: 正方向積算電力量（買電）
const EPC_COEFFICIENT = 0xd3; // 211: 係数
const EPC_UNIT = 0xe1; // 225: 積算電力量単位
const EPC_DIGITS = 0xd7; // 215: 有効桁数（最大値 = 10^digits - 1）

async function fetchNatureRemo(token: string) {
  const res = await fetch("https://api.nature.global/1/appliances", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Nature Remo API error: ${res.status}`);
  return res.json<NatureRemoAppliance[]>();
}

export function extractSmartMeterData(appliances: NatureRemoAppliance[]) {
  const sm = appliances.find((a) => a.type === "EL_SMART_METER");
  if (!sm?.smart_meter) return null;

  const props = sm.smart_meter.echonetlite_properties;

  // val は10進数文字列で返されるため parseInt(val, 10) で変換する
  const findProp = (epc: number) => props.find((p) => p.epc === epc);
  const getInt = (epc: number, fallback: number) =>
    findProp(epc) ? parseInt(findProp(epc)!.val, 10) : fallback;
  const getFloat = (epc: number) => {
    const prop = findProp(epc);
    return prop ? parseInt(prop.val, 10) : 0;
  };

  const watts = getFloat(EPC_WATTS); // hex → W
  const ampere = getFloat(EPC_AMPERE) / 10; // hex → A×10 → A
  const cum_raw = getInt(EPC_CUM_FORWARD, 0);
  const coefficient = getInt(EPC_COEFFICIENT, 1); // 未設定時は 1
  const unitCode = getInt(EPC_UNIT, 0x01); // 未設定時は 0x01 (0.1 kWh)
  const digits = getInt(EPC_DIGITS, 6); // 未設定時は 6桁（最大 999,999）

  // 実積算電力量 (kWh) = 生の値 × 係数 × 単位係数
  const cum_kwh = parseFloat((cum_raw * coefficient * unitFactor(unitCode)).toFixed(4));

  // オーバーフロー検知用に最大値を計算して保持
  const maxCount = Math.pow(10, digits) - 1;

  return { watts, ampere, cum_raw, cum_kwh, maxCount };
}

async function notifyLine(token: string, message: string) {
  const res = await fetch("https://notify-api.line.me/api/notify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `message=${encodeURIComponent(message)}`,
  });
  if (!res.ok) throw new Error(`LINE Notify error: ${res.status}`);
}

export async function collector(env: Env) {
  const appliances = await fetchNatureRemo(env.NATURE_TOKEN);
  const data = extractSmartMeterData(appliances);
  if (!data) return;

  // 直前の cum_raw を取得してオーバーフロー検知
  const prev = await env.DB.prepare(
    "SELECT cum_raw FROM power_log ORDER BY ts DESC LIMIT 1",
  ).first<{ cum_raw: number }>();

  if (prev && prev.cum_raw > data.cum_raw) {
    // カウンターがリセットされた（オーバーフロー）
    if (env.LINE_TOKEN) {
      await notifyLine(
        env.LINE_TOKEN,
        `ℹ️ 積算電力量カウンターがリセットされました\n(${prev.cum_raw} → ${data.cum_raw})`,
      );
    }
  }

  await env.DB.prepare(
    `INSERT INTO power_log (ts, watts, ampere, cum_raw, cum_kwh)
     VALUES (datetime('now'), ?, ?, ?, ?)`,
  )
    .bind(data.watts, data.ampere, data.cum_raw, data.cum_kwh)
    .run();

  if (env.LINE_TOKEN) {
    const threshold = parseFloat(env.ALERT_THRESHOLD_WATTS);
    if (data.watts > threshold) {
      await notifyLine(
        env.LINE_TOKEN,
        `⚠️ 消費電力が高い状態です\n現在: ${data.watts} W (閾値: ${threshold} W)`,
      );
    }
  }
}
