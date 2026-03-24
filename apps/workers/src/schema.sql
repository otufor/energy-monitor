CREATE TABLE IF NOT EXISTS power_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT    NOT NULL,
  watts    REAL    NOT NULL,
  ampere   REAL    NOT NULL,
  cum_raw  INTEGER NOT NULL, -- 積算電力量の生の値（係数・単位適用前）
  cum_kwh  REAL    NOT NULL  -- 実積算電力量 (kWh) = cum_raw × 係数 × 単位
);

CREATE INDEX IF NOT EXISTS idx_power_log_ts ON power_log (ts);
