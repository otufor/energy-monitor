# アーキテクチャ概要

## システム構成

```
Nature Remo E2 Lite
  │  B ルート (ECHONET Lite)
  ▼
スマートメーター
  │  Wi-Fi
  ▼
Nature Remo Cloud API  (https://api.nature.global)
  │  毎分 polling
  ▼
Cloudflare Workers (Cron Trigger)
  ├─▶ D1 (SQLite)       生データ・長期保存
  └─▶ R2 (Object)       日次 CSV アーカイブ
         │
         ▼
  Workers REST API  ◀──── React Dashboard (Cloudflare Pages)
         │
         ▼
  GitHub Actions (毎朝 6 時 JST)
    └─▶ Jupyter Notebook で解析
    └─▶ HTML レポート → R2 → Pages で公開
```

## パッケージ構成

```
energy-monitor/                  モノレポルート (Vite+)
├── apps/
│   ├── dashboard/               React + Recharts + TanStack Query
│   └── workers/                 Cloudflare Workers (Hono)
├── packages/
│   └── types/                   共通型定義・ユーティリティ
├── notebooks/                   Jupyter 解析ノートブック
├── scripts/                     CI/CD ヘルパースクリプト
└── .github/workflows/           GitHub Actions
```

## 設計方針

### サーバーレス・ゼロコスト

全コンポーネントを Cloudflare 無料枠に収める。

| コンポーネント | サービス       | 無料枠での制約                          |
| -------------- | -------------- | --------------------------------------- |
| データ収集     | Workers Cron   | 毎分実行 = 1,440 req/日（上限 100,000） |
| DB             | D1             | 5 GB、書き 100K 行/日                   |
| ストレージ     | R2             | 10 GB、書き 1M 回/月                    |
| フロントエンド | Pages          | 無制限                                  |
| 解析バッチ     | GitHub Actions | 月 120 分程度（上限 2,000 分）          |

### n8n を使わない理由

当初 n8n を検討したが以下の理由で不採用とした。

- **通知**: Workers Cron 内で LINE Notify を直接呼び出せる
- **スケジュール実行**: Workers Cron と GitHub Actions で代替できる
- **常時稼働**: n8n の自己ホストには Raspberry Pi 等が必要になりコストが増える

Workers + GitHub Actions の組み合わせで n8n の役割を全てカバーできる。

### データの二重保持 (`cum_raw` と `cum_kwh`)

スマートメーターの積算電力量は**生の整数値**で返ってくる。
これに係数と単位を掛けて kWh に変換するが、係数・単位が後から変わる可能性があるため、
生の値 (`cum_raw`) も D1 に保存し再計算できるようにしている。

詳細は [smart-meter.md](./smart-meter.md) を参照。

### Jupyter 解析ノートブック一覧

既存の `../nature-remo-e-lite` プロジェクトの分析をベースに実装する。

| ノートブック                | 実行タイミング | 内容                                             |
| --------------------------- | -------------- | ------------------------------------------------ |
| `daily_report.ipynb`        | 毎朝6時        | 前日グラフ・統計・電気代                         |
| `weekly_analysis.ipynb`     | 毎週月曜       | 曜日別比較・週次推移                             |
| `anomaly_detection.ipynb`   | 毎朝6時        | 異常値検知                                       |
| `monthly_summary.ipynb`     | 毎月1日        | 月次推移・前月比                                 |
| `weather_correlation.ipynb` | 毎月1日        | 気象データ（気温・日照時間）と消費電力の相関分析 |
