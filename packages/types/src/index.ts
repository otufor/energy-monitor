export interface PowerLog {
  id?: number;
  ts: string;
  watts: number;
  ampere: number;
  /** 正方向積算電力量の生の値（係数・単位適用前） */
  cum_raw: number;
  /** 正方向積算電力量 (kWh)。係数×単位を適用済み */
  cum_kwh: number;
}

export interface DailySummary {
  date: string;
  total_kwh: number;
  peak_watts: number;
  peak_time: string;
  avg_watts: number;
  cost_yen: number;
}

export interface NatureRemoProperty {
  epc: number;
  val: string;
  updated_at: string;
}

export interface NatureRemoAppliance {
  id: string;
  /** スマートメーターは "EL_SMART_METER" */
  type: string;
  smart_meter?: {
    echonetlite_properties: NatureRemoProperty[];
  };
}

/** 積算電力量単位 (EPC 0xE1) の値から kWh 換算係数を返す */
export function unitFactor(unitCode: number): number {
  // ECHONET Lite 規格: 0x00=1, 0x01=0.1, ..., 0x04=0.0001, 0x0A=10, ...
  const table: Record<number, number> = {
    0x00: 1,
    0x01: 0.1,
    0x02: 0.01,
    0x03: 0.001,
    0x04: 0.0001,
    0x0a: 10,
    0x0b: 100,
    0x0c: 1000,
    0x0d: 10000,
  };
  return table[unitCode] ?? 0.1; // 未定義時は最も一般的な 0.1 をデフォルト
}
