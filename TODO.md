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
