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
```

## 4. Workers のデプロイ

```bash
vp run workers#deploy
```

## 5. Dashboard のビルドと Pages デプロイ

```bash
# .env.local を作成
echo "VITE_WORKERS_API_URL=https://energy-monitor-workers.<account>.workers.dev" \
  > apps/dashboard/.env.local

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
# Workers をローカルで起動（D1 もローカルエミュレート）
vp run workers#dev

# Dashboard の開発サーバー起動
vp dev apps/dashboard
```

テスト:

```bash
vp run test -r
```
