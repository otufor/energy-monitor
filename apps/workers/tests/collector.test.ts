import { describe, it, expect } from "vite-plus/test";
import { extractSmartMeterData } from "../src/collector";
import { unitFactor } from "@energy-monitor/types";
import type { NatureRemoAppliance } from "@energy-monitor/types";

// EPC コード定数
const EPC_WATTS = 0xe7; // 231
const EPC_AMPERE = 0xe8; // 232
const EPC_CUM_FORWARD = 0xe0; // 224
const EPC_COEFFICIENT = 0xd3; // 211
const EPC_UNIT = 0xe1; // 225
const EPC_DIGITS = 0xd7; // 215

// val は10進数文字列で返される
const makeAppliance = (props: { epc: number; val: string }[]): NatureRemoAppliance[] => [
  {
    id: "appliance-1",
    type: "EL_SMART_METER",
    smart_meter: {
      echonetlite_properties: props.map((p) => ({
        ...p,
        updated_at: "2025-01-01T00:00:00Z",
      })),
    },
  },
];

describe("extractSmartMeterData", () => {
  it("実 API レスポンス相当のデータを正しく解析する", () => {
    // 実際の API レスポンス例 (val は10進数文字列)
    // epc=211 val='1', epc=215 val='6', epc=224 val='837062',
    // epc=225 val='1', epc=231 val='3086'
    const appliances = makeAppliance([
      { epc: EPC_COEFFICIENT, val: "1" }, // 係数 = 1
      { epc: EPC_DIGITS, val: "6" }, // 6桁
      { epc: EPC_CUM_FORWARD, val: "837062" }, // 積算値
      { epc: EPC_UNIT, val: "1" }, // 0x01 → 0.1 kWh
      { epc: EPC_WATTS, val: "3086" }, // 3086 W
    ]);

    const result = extractSmartMeterData(appliances);

    expect(result).not.toBeNull();
    expect(result?.watts).toBe(3086);
    expect(result?.cum_raw).toBe(837062);
    expect(result?.cum_kwh).toBe(83706.2); // 837062 × 1 × 0.1
    expect(result?.maxCount).toBe(999999);
  });

  it("係数が 3 の場合に正しく乗算する", () => {
    const appliances = makeAppliance([
      { epc: EPC_WATTS, val: "800" },
      { epc: EPC_AMPERE, val: "36" }, // 3.6A
      { epc: EPC_CUM_FORWARD, val: "1000" },
      { epc: EPC_COEFFICIENT, val: "3" },
      { epc: EPC_UNIT, val: "1" }, // 0.1 kWh
      { epc: EPC_DIGITS, val: "6" },
    ]);

    const result = extractSmartMeterData(appliances);
    expect(result?.cum_kwh).toBe(300); // 1000 × 3 × 0.1
  });

  it("単位コード 0 (1 kWh) を正しく処理する", () => {
    const appliances = makeAppliance([
      { epc: EPC_WATTS, val: "500" },
      { epc: EPC_AMPERE, val: "22" },
      { epc: EPC_CUM_FORWARD, val: "1234" },
      { epc: EPC_COEFFICIENT, val: "1" },
      { epc: EPC_UNIT, val: "0" }, // 0 → 1 kWh
      { epc: EPC_DIGITS, val: "6" },
    ]);

    const result = extractSmartMeterData(appliances);
    expect(result?.cum_kwh).toBe(1234); // 1234 × 1 × 1.0
  });

  it("type が EL_SMART_METER でない場合は null を返す", () => {
    const appliances: NatureRemoAppliance[] = [{ id: "a1", type: "AC" }];
    expect(extractSmartMeterData(appliances)).toBeNull();
  });

  it("type が EL の場合も null を返す（正しくは EL_SMART_METER）", () => {
    const appliances: NatureRemoAppliance[] = [
      { id: "a1", type: "EL", smart_meter: { echonetlite_properties: [] } },
    ];
    expect(extractSmartMeterData(appliances)).toBeNull();
  });

  it("空の配列は null を返す", () => {
    expect(extractSmartMeterData([])).toBeNull();
  });

  it("係数・単位が未設定の場合はデフォルト値 (係数=1, 単位=0.1) を使う", () => {
    const appliances = makeAppliance([
      { epc: EPC_WATTS, val: "800" },
      { epc: EPC_CUM_FORWARD, val: "5167" },
      // EPC_COEFFICIENT, EPC_UNIT は省略
    ]);

    const result = extractSmartMeterData(appliances);
    expect(result?.cum_kwh).toBe(516.7); // 5167 × 1(default) × 0.1(default)
  });

  it("EPC_AMPERE 未設定の場合は 0 を返す", () => {
    // 実 API レスポンスで EPC 0xE8 が含まれない場合がある
    const appliances = makeAppliance([
      { epc: EPC_WATTS, val: "3086" },
      { epc: EPC_CUM_FORWARD, val: "837062" },
      { epc: EPC_COEFFICIENT, val: "1" },
      { epc: EPC_UNIT, val: "1" },
    ]);

    const result = extractSmartMeterData(appliances);
    expect(result?.ampere).toBe(0);
  });

  it("オーバーフロー検知用の maxCount を正しく計算する", () => {
    const appliances = makeAppliance([
      { epc: EPC_WATTS, val: "100" },
      { epc: EPC_CUM_FORWARD, val: "0" },
      { epc: EPC_COEFFICIENT, val: "1" },
      { epc: EPC_UNIT, val: "1" },
      { epc: EPC_DIGITS, val: "6" },
    ]);

    const result = extractSmartMeterData(appliances);
    expect(result?.maxCount).toBe(999999); // 10^6 - 1
  });
});

describe("unitFactor", () => {
  it.each([
    [0, 1],
    [1, 0.1],
    [2, 0.01],
    [3, 0.001],
    [4, 0.0001],
    [10, 10],
    [11, 100],
    [12, 1000],
    [13, 10000],
  ])("unitCode %i → %f", (code, expected) => {
    expect(unitFactor(code)).toBe(expected);
  });

  it("未定義コードは 0.1 を返す", () => {
    expect(unitFactor(255)).toBe(0.1);
  });
});
