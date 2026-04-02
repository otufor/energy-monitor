---
name: architecture-explorer
description: Analyze a codebase architecture, explain it graphically, compare multiple design lenses such as MVC, layered architecture, and clean architecture, and iterate with the user through interactive HTML artifacts. Use when the user wants architecture analysis, architecture proposals, responsibility mapping, layer diagrams, refactoring direction, or interactive visual explanations tied to real files in the repository.
---

# Architecture Explorer

コードベースの構造を読み取り、複数の設計観点で説明し、対話を通じて図と提案を更新するためのスキル。

## モード

### 現状分析モード

現状のコードをどう読むかを明確にするモード。

- 目的: いまの構成を理解し、責務の分布や混ざり方を可視化する
- 主な出力:
  - 現状の責務マップ
  - MVC / レイヤード / クリーンアーキテクチャ比較
  - ビジネスロジック、アプリケーションロジック、インフラの境界整理
  - 現状構成の良い点と曖昧な点
- 向いている依頼:
  - 「このプロジェクトの構成を説明して」
  - 「どこがビジネスロジックか整理して」
  - 「このコードベースを複数の観点で図解して」

### 改善提案モード

現状を踏まえて、より良い境界やモジュール分割を提案するモード。

- 目的: 保守性、変更容易性、学習しやすさを高める方向を示す
- 主な出力:
  - 現状案 / 改善案 の比較図
  - 責務の再配置案
  - 段階的なリファクタ手順
  - 最初に触るべき 1 手
- 向いている依頼:
  - 「どこからリファクタすると良い？」
  - 「クリーンアーキテクチャ寄りに整理したい」
  - 「今の構成のまま最小変更で改善したい」

## 使う場面

- このプロジェクトのアーキテクチャを説明してほしい
- MVC / レイヤード / クリーンアーキテクチャで見比べたい
- ビジネスロジックとインフラの境界を整理したい
- リファクタ案を図で見たい
- Claude のようなインタラクティブ HTML で示してほしい

## 進め方

1. まずコードベースと主要ドキュメントを読み、実ファイルに紐づく責務を洗い出す。
2. 依頼が `現状分析モード` か `改善提案モード` かを判断する。明示されていない場合は、最初は現状分析から入る。
3. 1つの正解に固定せず、少なくとも 2 つ以上の設計レンズで説明候補を作る。
4. 各レンズごとに次を整理する。
   - 何を中心に切り分ける見方か
   - このリポジトリではどのファイルがどの責務に当たるか
   - 今の構成の良い点
   - 混ざっている責務
   - 改善するとしたらどこから触るか
5. ユーザーが視覚化を望む場合は、一時 HTML を作る。
6. HTML は説明だけでなく、比較と対話の起点になるようにする。

## HTML アーティファクトの方針

- `/tmp` か `docs/tmp` に一時 HTML を出す
- まず `assets/interactive-architecture-template.html` をベースにし、今回のコードベースの内容で埋める
- 単なる静的図ではなく、少なくとも次のどれかを含める
  - 観点切替タブ
  - レイヤー選択
  - 責務ごとの詳細パネル
  - 現状案と改善案の比較
  - ファイル対応表
- 見た目は「説明資料」ではなく「探索ツール」に寄せる
- 可能ならクリックで詳細が切り替わるようにする

## 説明の原則

- 用語説明だけで終わらせず、必ずこのコードベースの実ファイルへ接続する
- 「技術名」ではなく「責務」で切る
- 断定しすぎず、「この見方ではこう読める」とレンズ依存で説明する
- 小規模プロジェクトでは厳密分類より pragmatic な整理を優先する

## 提案の原則

- 改善案は段階的に出す
- まずは責務の抽出
- 次にモジュール境界の提案
- 最後に必要ならファイル分割や命名変更まで出す
- 大きな再設計を提案する場合も、最初の 1 手を必ず示す

## このスキルでよく使う出力

- 「現状の責務マップ」
- 「複数アーキテクチャ観点の比較表」
- 「改善前 / 改善後のレイヤー図」
- 「一時的なインタラクティブ HTML」
- 「現状分析モードから改善提案モードへの差分説明」

## 読み進める優先順

1. `README.md`
2. `docs/architecture.md` や API / setup ドキュメント
3. エントリポイント
4. 主要ユースケースの実装
5. UI 側の hook / component

## 必要に応じて読む参考

- 比較観点のテンプレートは `references/lenses.md`
- 対話の進め方は `references/facilitation.md`
- HTML の構成指針は `references/interactive-html.md`
- HTML の再利用テンプレートは `assets/interactive-architecture-template.html`

## テンプレート運用

- HTML を新規で毎回ゼロから書かず、まずテンプレートを複製して使う
- 現状分析モードでは `current-state` 系の表示を中心に埋める
- 改善提案モードでは `proposal` 系の表示と比較セクションを埋める
- テンプレートは汎用、出力 HTML は案件固有という役割分担にする
