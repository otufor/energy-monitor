# TODO

## 優先度: 高

- [ ] **PowerChart: タッチ操作対応**
  - `mousemove/mouseup` に加えて `touchmove/touchend` を追加
  - ピンチズームでホイールズームに相当する操作を実現

## 優先度: 中

- [ ] **PowerChart: ChartBody の状態管理をリファクタ**
  - 13個のプロパティをバケツリレーしている `ChartBodyProps` を整理
  - `isDragging` / `thresholdDragging` 系を `useChartInteraction()` カスタムフックに抽出

- [ ] **Workers: 大きな時間範囲のページネーション**
  - `/api/power/range` に `limit` / `offset` クエリパラメータを追加
  - または `resolution` パラメータで間引き（例: 1時間表示なら5分毎に集約）

- [ ] **DailySummary: 過去日比較機能**
  - 前日比の差分表示（`+300W`, `-2kWh` 等）
  - 週次グラフ（棒グラフで7日分の kWh 比較）

- [ ] **閾値の同期**
  - UI 側の閾値（localStorage）と Workers 側のアラート閾値が別管理
  - `GET/PUT /api/config/threshold` エンドポイントを追加してサーバー側と同期

## 優先度: 低

- [ ] **テスト: カバレッジ拡充**
  - `DailySummary.test.tsx` の追加（4カードの値表示確認）
  - `usePowerData.test.ts` で React Query の動作確認

- [ ] **PowerChart: isError 表示の改善**
  - `isError || !data` でエラーと空データを区別できていない
  - エラー時と空データ時でメッセージを分けてUXを向上

- [ ] **Workers: LINE Notify のエラーを握り潰している**
  - `collector.ts` の `notifyLine` が HTTP エラー（401, 429等）を無音でスルー
  - `if (!res.ok) throw new Error(...)` を追加する

- [ ] **Workers: `toDb()` が UTC 以外の ISO オフセットを処理できない**
  - `/api/power/range` の `toDb()` で `+09:00` 等が残り SQLite 比較が壊れる
  - 現状クライアントは UTC のみ送るため潜在的バグ

- [ ] **Workers: `getFloat` が内部で `parseInt` を使っている**
  - `collector.ts` の `getFloat` が `parseInt` を呼んでおり名前が misleading
  - `getInt` とほぼ重複しているため整理する

- [ ] **Workers: `cum_raw` が CSV エクスポートから欠落している**
  - `api.ts` の `/api/export/daily` で SQL が `cum_raw` を SELECT していないが
    ヘッダーと行テンプレートで参照しているため列が常に空になる

- [ ] **Dashboard: API キーヘッダーが未送信**
  - `usePowerData.ts` の fetch に `X-Api-Key` ヘッダーがなく本番で全て 401 になる
  - `r.ok` チェックも未実装のためエラーが成功扱いされる

- [ ] **Security: `/dev/collect` が本番にデプロイされている**
  - `index.ts` の `/dev/collect` は認証なしで本番にも存在する
  - 環境変数による条件分岐または API キー認証を適用する

- [ ] **Workers: `summary/:date` でデータ疎の場合に null フィールドが返る**
  - 1件しかデータがない日は `MAX - MIN = NULL` になり `total_kwh` 等が null
  - `COALESCE(MAX(cum_kwh) - MIN(cum_kwh), 0)` を使う

- [ ] **Cleanup: `packages/utils` がプレースホルダーのまま**
  - `packages/utils/src/index.ts` に未使用のスキャフォールドコードのみ
  - 実際のユーティリティを移すかパッケージを削除する
