# Architecture Lenses

## MVC

- Model: 意味あるデータと業務ルール
- View: 表示とユーザー体験
- Controller: 入力を受けて処理へつなぐ窓口

見るときの問い:

- このコードは何を表示する責務か
- 入力やイベントを受ける責務か
- 業務上の意味や計算を持つ責務か

## Layered Architecture

- Presentation
- Application
- Domain
- Infrastructure

見るときの問い:

- 表示都合か
- ユースケースの流れか
- 業務知識そのものか
- 外部技術や接続の都合か

## Clean Architecture

- Entities
- Use Cases
- Interface Adapters
- Frameworks and Drivers

見るときの問い:

- 最も長生きする概念は何か
- ユースケースとして独立して説明できるか
- 外界との変換をしているか
- 交換可能な技術実装か

## よくある混ざり方

- API handler に業務計算が入る
- SQL に集計ルールが埋まる
- hook に画面固有の業務判断が入る
- component に API 都合が漏れる

これらは悪ではないが、説明時には「どこが混ざっているか」をはっきり言う。
