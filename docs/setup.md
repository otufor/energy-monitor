# セットアップガイド

## 前提条件

- Node.js 22 以上
- Vite+ (`vp`) インストール済み
- Cloudflare アカウント
- Nature Remo E2 Lite と Nature Remo アカウント
- LINE Notify トークン（通知用）

---

## 1. 依存関係のインストール

```bash
vp install
```

## 2. Cloudflare リソースの作成

### D1 データベース

```bash
wrangler d1 create energy-db
```

出力された `database_id` を `apps/workers/wrangler.toml` に設定する:

```toml
[[d1_databases]]
binding = "DB"
database_name = "energy-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← ここに設定
```

### D1 テーブル作成

```bash
wrangler d1 execute energy-db --file=apps/workers/src/schema.sql
```

### R2 バケット

```bash
wrangler r2 bucket create energy-reports
```

## 3. Secrets の設定

```bash
# Nature Remo API トークン
# https://home.nature.global → アカウント → アクセストークン発行
wrangler secret put NATURE_TOKEN

# LINE Notify トークン
# https://notify-bot.line.me/my/ → トークン発行
wrangler secret put LINE_TOKEN

# 書き込み系 API / 手動収集用の認証キー
wrangler secret put API_KEY
```

## 4. Workers のデプロイ

```bash
vp run workers#deploy
```

## 5. Dashboard のビルドと Pages デプロイ

```bash
# 公開設定だけを .env.local に置く
cp apps/dashboard/.env.example apps/dashboard/.env.local

# marimo notebook 用ローカル設定
cp notebooks/.env.example notebooks/.env

# apps/dashboard/.env.local を編集
# VITE_WORKERS_API_URL=https://energy-monitor-workers.<account>.workers.dev

# notebooks/.env を編集
# MARIMO_WORKERS_API_URL=https://energy-monitor-workers.<account>.workers.dev
# MARIMO_API_KEY=<必要な場合だけ設定>

# ビルド
vp build --filter dashboard

# Cloudflare Pages に手動デプロイ（初回）
wrangler pages deploy apps/dashboard/dist --project-name energy-monitor
```

以降は `main` ブランチへの push で GitHub Actions が自動デプロイする。

## 6. GitHub Secrets の設定

GitHub リポジトリの Settings → Secrets and variables → Actions に追加:

| シークレット名         | 値                                                   |
| ---------------------- | ---------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API トークン（Workers + Pages + R2 権限） |
| `CF_ACCOUNT_ID`        | Cloudflare アカウント ID                             |
| `WORKERS_API_URL`      | Workers の URL                                       |
| `R2_ENDPOINT`          | `https://<account_id>.r2.cloudflarestorage.com`      |
| `R2_ACCESS_KEY_ID`     | R2 API トークン（アクセスキー ID）                   |
| `R2_SECRET_ACCESS_KEY` | R2 API トークン（シークレットキー）                  |
| `R2_BUCKET`            | `energy-reports`                                     |
| `LINE_TOKEN`           | LINE Notify トークン                                 |
| `API_KEY`              | 書き込み系 API / 手動収集用の認証キー                |

## 7. 動作確認

```bash
# Workers のログをリアルタイム確認
wrangler tail

# D1 にデータが入っているか確認（1 分後）
wrangler d1 execute energy-db \
  --command "SELECT * FROM power_log ORDER BY ts DESC LIMIT 5"
```

---

## ローカル開発

```bash
# 秘匿情報は .dev.vars に保管
cp apps/workers/.dev.vars.example apps/workers/.dev.vars
cp notebooks/.env.example notebooks/.env

# Workers をローカルで起動（D1 もローカルエミュレート）
vp run workers#dev

# Dashboard の開発サーバー起動
vp dev apps/dashboard
```

`apps/workers/.dev.vars`:

```bash
NATURE_TOKEN=<Nature Remo アクセストークン>
LINE_TOKEN=<LINE Notify トークン>
API_KEY=<ローカル開発用 API キー>
```

`.env` には公開して問題ない値だけを置き、トークンや API キーは `.dev.vars`、Cloudflare Secrets、GitHub Secrets に保存する。

marimo notebook は `notebooks/.env` から `MARIMO_WORKERS_API_URL` と `MARIMO_API_KEY` を読み込む。

テスト:

```bash
vp run test -r
```
