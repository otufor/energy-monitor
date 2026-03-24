# Workers REST API 仕様

ベース URL: `https://energy-monitor-workers.<account>.workers.dev`

認証は現在未実装。本番環境では `X-API-Key` ヘッダー等で保護すること。

---

## GET `/api/power/recent`

直近 N 分間の電力ログを時系列順で返す。

### クエリパラメータ

| パラメータ | 型     | デフォルト | 説明               |
| ---------- | ------ | ---------- | ------------------ |
| `minutes`  | number | 60         | 取得する過去の分数 |

### レスポンス

```json
[
  {
    "ts": "2025-01-01 12:00:00",
    "watts": 1200,
    "ampere": 5.5,
    "cum_raw": 5167,
    "cum_kwh": 516.7
  }
]
```

| フィールド | 型     | 説明                                        |
| ---------- | ------ | ------------------------------------------- |
| `ts`       | string | タイムスタンプ (UTC, `YYYY-MM-DD HH:MM:SS`) |
| `watts`    | number | 瞬時電力 (W)                                |
| `ampere`   | number | 瞬時電流 (A)                                |
| `cum_raw`  | number | 積算電力量の生カウンタ値                    |
| `cum_kwh`  | number | 実積算電力量 (kWh)。係数×単位適用済み       |

### 例

```bash
# 直近 60 分（デフォルト）
curl https://.../api/power/recent

# 直近 24 時間（1440 分）
curl https://.../api/power/recent?minutes=1440
```

---

## GET `/api/summary/:date`

指定日の日次サマリーを返す。

### パスパラメータ

| パラメータ | 形式         | 例           |
| ---------- | ------------ | ------------ |
| `date`     | `YYYY-MM-DD` | `2025-01-01` |

### レスポンス

```json
{
  "date": "2025-01-01",
  "total_kwh": 12.5,
  "peak_watts": 2800,
  "peak_time": "2025-01-01 18:30:00",
  "avg_watts": 520,
  "cost_yen": 375
}
```

| フィールド   | 型     | 説明                                            |
| ------------ | ------ | ----------------------------------------------- |
| `date`       | string | 対象日                                          |
| `total_kwh`  | number | 消費電力量 (kWh)。`MAX(cum_kwh) - MIN(cum_kwh)` |
| `peak_watts` | number | ピーク電力 (W)                                  |
| `peak_time`  | string | ピーク発生時刻                                  |
| `avg_watts`  | number | 平均電力 (W)                                    |
| `cost_yen`   | number | 電気代概算 (円)。`total_kwh × COST_PER_KWH`     |

### エラー

| ステータス | 条件                       |
| ---------- | -------------------------- |
| `404`      | 指定日のデータが存在しない |

### 例

```bash
curl https://.../api/summary/2025-01-01
```

---

## POST `/api/export/daily`

指定日の全データを CSV に変換して R2 に保存する。
GitHub Actions の日次バッチから呼び出される。

### リクエストボディ

```json
{ "date": "2025-01-01" }
```

### レスポンス

```json
{ "ok": true, "rows": 1440 }
```

### 保存先

```
R2 バケット: energy-reports
キー:        daily/2025-01-01.csv
```

### CSV フォーマット

```csv
ts,watts,ampere,cum_raw,cum_kwh
2025-01-01 00:01:00,800,3.5,5001,500.1
2025-01-01 00:02:00,850,3.7,5002,500.2
```

---

## Cron トリガー（内部）

REST API ではなく Workers の Scheduled Handler として動作する。

| スケジュール        | 処理                                                               |
| ------------------- | ------------------------------------------------------------------ |
| `* * * * *`（毎分） | Nature Remo API をポーリングして D1 に記録。閾値超過時に LINE 通知 |

### 環境変数 / Secrets

| 名前                    | 種別   | 説明                                         |
| ----------------------- | ------ | -------------------------------------------- |
| `NATURE_TOKEN`          | Secret | Nature Remo API アクセストークン             |
| `LINE_TOKEN`            | Secret | LINE Notify トークン                         |
| `COST_PER_KWH`          | Var    | 1 kWh あたりの電気代（円）。デフォルト `30`  |
| `ALERT_THRESHOLD_WATTS` | Var    | 高電力アラートの閾値（W）。デフォルト `3000` |

Secrets の登録:

```bash
wrangler secret put NATURE_TOKEN
wrangler secret put LINE_TOKEN
```

---

## D1 スキーマ

```sql
CREATE TABLE power_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT    NOT NULL,          -- UTC タイムスタンプ
  watts    REAL    NOT NULL,          -- 瞬時電力 (W)
  ampere   REAL    NOT NULL,          -- 瞬時電流 (A)
  cum_raw  INTEGER NOT NULL,          -- 積算電力量の生カウンタ値
  cum_kwh  REAL    NOT NULL           -- 実積算電力量 (kWh)
);

CREATE INDEX idx_power_log_ts ON power_log (ts);
```
