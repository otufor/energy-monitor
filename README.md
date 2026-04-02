# energy-monitor

Nature Remo E2 Lite を使った家庭向け消費電力モニタリングシステム。
スマートメーターのデータを毎分収集し、リアルタイムダッシュボードと日次レポートで可視化する。

## 概要

```
スマートメーター
  │ ECHONET Lite (B ルート)
  ▼
Nature Remo E2 Lite
  │ Wi-Fi
  ▼
Nature Remo Cloud API
  │ 毎分 polling
  ▼
Cloudflare Workers ──▶ D1 (生データ) / R2 (日次 CSV)
  │
  ▼
React Dashboard (Cloudflare Pages)

GitHub Actions (毎朝 6 時)
  └▶ Jupyter 解析レポート → R2 → Pages
```

## 機能

- **リアルタイム監視** — 瞬時電力・積算電力量を毎分取得
- **ダッシュボード** — 直近 60 分の電力グラフ・日次サマリー（消費 kWh・ピーク・電気代概算）
- **日次レポート** — Jupyter Notebook で自動生成、Cloudflare Pages で公開
- **アラート通知** — 閾値超過時に LINE Notify で通知
- **オーバーフロー検知** — 積算カウンタのリセットを自動検知・通知

## 技術スタック

| レイヤー       | 技術                                                |
| -------------- | --------------------------------------------------- |
| フロントエンド | React 19 + Recharts + TanStack Query + Tailwind CSS |
| ビルド         | Vite+ (`vp`)                                        |
| ホスティング   | Cloudflare Pages                                    |
| API / 収集     | Cloudflare Workers (Hono) + Cron Trigger            |
| DB             | Cloudflare D1 (SQLite)                              |
| ストレージ     | Cloudflare R2                                       |
| 解析           | Jupyter Notebook + GitHub Actions                   |

すべて **Cloudflare 無料枠**で動作する（Workers 100K req/日・D1 5GB・R2 10GB）。

## リポジトリ構成

```
energy-monitor/
├── apps/
│   ├── dashboard/               React ダッシュボード
│   │   └── src/
│   │       ├── components/
│   │       │   ├── PowerChart.tsx      瞬時電力グラフ
│   │       │   └── DailySummary.tsx    日次サマリーカード
│   │       └── hooks/
│   │           └── usePowerData.ts     Workers API フック
│   └── workers/                 Cloudflare Workers
│       └── src/
│           ├── collector.ts            Nature Remo 収集 + LINE 通知
│           ├── api.ts                  REST API (Hono)
│           ├── index.ts                エントリポイント
│           └── schema.sql              D1 テーブル定義
├── packages/
│   └── types/                   共通型定義・unitFactor ユーティリティ
├── notebooks/                   Jupyter 解析ノートブック
├── scripts/
│   └── upload_r2.py             R2 アップロードスクリプト
├── docs/                        仕様ドキュメント
└── .github/workflows/
    ├── deploy.yml               Workers + Pages 自動デプロイ
    └── daily-report.yml         日次レポート生成 (毎朝 6 時 JST)
```

## セットアップ

### 前提条件

- Node.js 22 以上 / Vite+ (`vp`) インストール済み
- Cloudflare アカウント
- Nature Remo E2 Lite + Nature Remo アカウント（アクセストークン取得済み）

### 1. 依存関係インストール

```bash
vp install
```

### 2. ローカル開発用の環境変数とシークレット設定

```bash
cp apps/workers/.dev.vars.example apps/workers/.dev.vars
cp apps/dashboard/.env.example apps/dashboard/.env.local
cp notebooks/.env.example notebooks/.env
```

`apps/workers/.dev.vars` には秘匿情報を設定する:

```bash
NATURE_TOKEN=<Nature Remo アクセストークン>
LINE_TOKEN=<LINE Notify トークン>
API_KEY=<ローカル開発用 API キー>
```

`apps/dashboard/.env.local` には公開してよい設定だけを置く:

```bash
VITE_WORKERS_API_URL=http://localhost:8787
```

`notebooks/.env` には marimo notebook 用のローカル設定を置く:

```bash
MARIMO_WORKERS_API_URL=http://localhost:8787
MARIMO_API_KEY=<必要な場合だけ設定>
```

### 3. D1 ローカル DB 初期化

```bash
cd apps/workers
npx wrangler d1 execute energy-db --local --file=src/schema.sql
```

### 4. 起動

```bash
# Workers API + 毎分 Cron 自動収集 (http://localhost:8787)
vp run workers#dev:all

# Dashboard (http://localhost:5173)
vp run dashboard#dev
```

`workers#dev:all` は wrangler dev と cron トリガースクリプトを並列起動する。
Ctrl+C で両方終了する。

### 5. データ収集の即時テスト

```bash
curl http://localhost:8787/dev/collect
# → {"ok":true}
```

> `/dev/collect` はローカル開発専用エンドポイント。本番の Workers には存在しない。

## 本番デプロイ

詳細は [docs/setup.md](./docs/setup.md) を参照。

```bash
# D1 / R2 作成 → wrangler.toml に database_id を記入後:
wrangler secret put NATURE_TOKEN
wrangler secret put LINE_TOKEN
wrangler secret put API_KEY

# Workers デプロイ
vp run workers#deploy

# Dashboard ビルド & Pages デプロイ
vp build --filter dashboard
wrangler pages deploy apps/dashboard/dist --project-name energy-monitor
```

## 開発コマンド

```bash
vp install          # 依存関係インストール
vp run test -r      # 全テスト実行
vp run build -r     # 全パッケージビルド
vp check            # 型チェック + lint + フォーマット
```

## API エンドポイント

| メソッド | パス                           | 説明                                          |
| -------- | ------------------------------ | --------------------------------------------- |
| `GET`    | `/api/power/recent?minutes=60` | 直近 N 分の電力ログ（UTC 保存、そのまま返却） |
| `GET`    | `/api/summary/:date`           | 日次サマリー（date は JST 日付 `yyyy-MM-dd`） |
| `POST`   | `/api/export/daily`            | 指定日（JST）の CSV を R2 へ保存              |
| `GET`    | `/dev/collect` ※開発専用       | 即時データ収集（本番 Workers には存在しない） |

詳細は [docs/api.md](./docs/api.md) を参照。

## Notebook 公開 URL

`Deploy Notebook` workflow で marimo WASM notebook を2本同時にデプロイする。

- `/` : Notebook Hub
- `/energy/` : 軽量サマリー分析 (`notebooks/energy_analysis.py`)
- `/detailed/` : 詳細分析 (`notebooks/detailed_energy_analysis.py`)

## スマートメーター仕様

Nature Remo API から取得する主な ECHONET Lite プロパティ：

| EPC          | 内容             | 備考                       |
| ------------ | ---------------- | -------------------------- |
| `0xE7` (231) | 瞬時電力 (W)     | `val` は10進数文字列       |
| `0xE0` (224) | 正方向積算電力量 | `実値 = val × 係数 × 単位` |
| `0xD3` (211) | 係数             | 未設定時は 1               |
| `0xE1` (225) | 単位コード       | `1` → 0.1 kWh が一般的     |

詳細は [docs/smart-meter.md](./docs/smart-meter.md) を参照。

## テスト

```bash
vp run test -r
```

```
✅ apps/workers    24 tests  (collector / API)
✅ apps/dashboard   5 tests  (PowerChart / DailySummary)
✅ packages/utils   1 test
```

## ドキュメント

| ファイル                                       | 内容                                  |
| ---------------------------------------------- | ------------------------------------- |
| [docs/architecture.md](./docs/architecture.md) | システム構成・設計方針                |
| [docs/smart-meter.md](./docs/smart-meter.md)   | ECHONET Lite EPC・電力量計算仕様      |
| [docs/api.md](./docs/api.md)                   | Workers REST API 仕様・DB スキーマ    |
| [docs/setup.md](./docs/setup.md)               | Cloudflare リソース作成・デプロイ手順 |

## 環境変数

| 名前                     | 設定先             | 説明                                         |
| ------------------------ | ------------------ | -------------------------------------------- |
| `NATURE_TOKEN`           | wrangler secret    | Nature Remo API アクセストークン（必須）     |
| `LINE_TOKEN`             | wrangler secret    | LINE Notify トークン（空の場合は通知しない） |
| `API_KEY`                | wrangler secret    | 書き込み系 API と `/dev/collect` の認証キー  |
| `COST_PER_KWH`           | wrangler.toml vars | 電気代単価（円/kWh）。デフォルト `30`        |
| `ALERT_THRESHOLD_WATTS`  | wrangler.toml vars | アラート閾値（W）。デフォルト `3000`         |
| `VITE_WORKERS_API_URL`   | .env.local         | Dashboard が参照する Workers URL             |
| `MARIMO_WORKERS_API_URL` | notebooks/.env     | marimo notebook が参照する Workers URL       |
| `MARIMO_API_KEY`         | notebooks/.env     | marimo notebook が使う API キー              |

センシティブな値は `apps/workers/.dev.vars`、Cloudflare Workers Secrets、GitHub Secrets に保存し、`.env` には公開して問題ない値だけを置く。
