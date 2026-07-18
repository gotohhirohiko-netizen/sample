# システム構成書 — 個人用家計簿アプリ

version: 0.2(ドラフト)。**Mac非保有のため、Xcode/Swiftネイティブアプリからブラウザで動くPWA(Progressive Web App)方式に転換**(2026年の方針転換を反映)。

## 1. 方針転換の経緯

- 当初はiOSネイティブ(Swift/SwiftUI)アプリとして設計していたが、開発者がMacを保有していない(iPhoneのみ)ことが判明した
- iOSネイティブアプリの実機インストールには、Xcodeでのビルド(macOS必須)に加え、TestFlight配信のためのApple Developer Program登録(年間$99)が必要になる
- **費用ゼロ・Mac不要**を優先し、Webアプリ(PWA)としてSafariの「ホーム画面に追加」機能でアプリのように使う方式に転換した
- これに伴い、機能要件(要件定義書)は変更なしだが、実現方式(本書・design.md)を全面的に書き換えている

## 2. 全体構成図

```mermaid
graph TB
    subgraph app["PWA(ブラウザで動作するWebアプリ)"]
        UI["UI(React + TypeScript)"]
        Import["インポート機能"]
        Client["Claude APIクライアント<br/>(@anthropic-ai/sdk, dangerouslyAllowBrowser)"]
        Store[("ローカルストレージ<br/>IndexedDB")]
        KeyStore[("ブラウザストレージ<br/>Anthropic APIキー")]
        SW["Service Worker<br/>(オフラインキャッシュ・PWA化)"]
    end

    subgraph ext["外部要素"]
        NewTab["新規タブ(ブラウザ標準機能)"]
        MUFG["三菱UFJダイレクト<br/>(2口座)"]
        Rakuten["楽天カード e-NAVI"]
        PayPay["PayPayカード<br/>会員メニュー"]
        Files["iOS ファイルApp"]
        Claude["Claude API"]
        Hosting["静的ホスティング<br/>(GitHub Pages)"]
    end

    Hosting -->|配信| UI
    UI --> Import
    Import --> NewTab
    NewTab -.->|手動ログイン/DL| MUFG
    NewTab -.->|手動ログイン/DL| Rakuten
    NewTab -.->|手動ログイン/DL| PayPay
    MUFG -->|CSV| Files
    Rakuten -->|CSV| Files
    PayPay -->|CSV| Files
    Files -->|input type=file で手動選択| Import
    Import --> Client
    Client -->|APIキー参照| KeyStore
    Client <-->|PDF/CSV送信 → 構造化JSON| Claude
    Client --> Store
    Store --> UI
    SW -.->|キャッシュ・ホーム画面アイコン化| UI
```

**ポイント**: サーバー(バックエンド)は持たず、ブラウザからClaude APIへ直接通信する点はネイティブ版の設計から変わらない。「手動ログイン→ダウンロード→手動選択→AI解析」という半自動フローの考え方もそのまま踏襲し、`SFSafariViewController`が「新規タブを開く」ブラウザ標準機能に置き換わっただけである。

## 3. コンポーネント一覧

| コンポーネント | 役割 | 技術 |
|---|---|---|
| UI | 取引一覧・インポート・集計・設定画面のUI | React + TypeScript |
| インポート機能 | 取り込み元選択・新規タブ起動・ファイル選択・プレビュー確認 | `window.open()` + `<input type="file">` |
| Claude APIクライアント | PDF/CSVをClaude APIへ送信し、構造化JSONを受信 | `@anthropic-ai/sdk`(`dangerouslyAllowBrowser: true`) |
| ローカルストレージ | 取引データ・取り込み元設定・カテゴリ等の永続化 | IndexedDB(`idb`ライブラリ経由) |
| APIキー保存 | Anthropic APIキーの保存 | ブラウザストレージ(IndexedDB。Keychainほどの保護は無い点に注意、5章参照) |
| Service Worker / マニフェスト | ホーム画面へのアイコン追加、オフライン時の静的アセットキャッシュ | `vite-plugin-pwa`(Workbox) |
| ホスティング | ビルド済み静的ファイルの配信 | GitHub Pages(無料) |

## 4. 技術スタック

| レイヤー | 選定技術 | 理由 |
|---|---|---|
| プラットフォーム | Webブラウザ(iOS Safari想定) | Mac不要・費用ゼロで自分のiPhoneにインストール可能な唯一の現実的な手段 |
| フレームワーク | Vite + React + TypeScript | 定番構成で情報量が多く、この開発環境(Linux)でも`npm run build`で実際にビルド検証ができる |
| PWA化 | `vite-plugin-pwa` | マニフェスト・Service Workerの設定を自動化し、「ホーム画面に追加」を機能させる |
| バックエンド | なし | 個人単一ユーザー利用のため、サーバー運用コストを回避(ネイティブ版から方針継続) |
| 外部API | Claude API(Anthropic) | PDF/CSVの直接解析・構造化JSON出力に対応 |
| APIクライアント | `@anthropic-ai/sdk`(公式JS/TS SDK) | ブラウザからの直接利用を`dangerouslyAllowBrowser`オプションで公式にサポートしている |
| ローカルDB | IndexedDB(`idb`) | ブラウザ標準の永続化機構。ネイティブ版のSwiftData相当 |
| ホスティング | GitHub Pages | 既存のGitHubリポジトリからそのまま無料でデプロイできる |

## 5. データフロー(インポート処理のシーケンス)

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant PWA as PWA(ブラウザタブ)
    participant NewTab as 新規タブ
    participant Bank as 金融機関サイト
    participant Files as iOSファイルApp
    participant Claude as Claude API
    participant DB as IndexedDB

    User->>PWA: 「明細を取り込む」をタップ(機関を選択)
    PWA->>NewTab: 登録済みディープリンクを新規タブで開く
    NewTab-->>Bank: ページ読み込み
    User->>Bank: 手動ログイン・2段階認証
    User->>Bank: 明細ページへ遷移・CSV/PDFダウンロード
    Bank-->>Files: ファイル保存
    User->>PWA: PWAのタブ(ホーム画面アイコン)に戻る
    User->>PWA: 「ファイルを選択」(input type=file)でファイル選択
    PWA->>Files: ファイル読み込み(File API)
    PWA->>Claude: ファイル + 抽出用JSON Schemaを送信
    Claude-->>PWA: 構造化JSON(取引配列)を返却
    PWA->>User: プレビュー画面(抽出結果・重複候補を表示)
    User->>PWA: 内容を確認し確定
    PWA->>DB: Transactionとして保存(IndexedDB)
```

## 6. 外部サービス依存

| サービス | 用途 | 依存度・リスク |
|---|---|---|
| 三菱UFJダイレクト / 楽天e-NAVI / PayPayカード会員メニュー | 明細のCSV/PDFダウンロード元 | 各社のサイト構成変更によりディープリンクが失効する可能性あり(手動操作のみのため自動化ツールほどの壊れやすさはない) |
| Claude API(Anthropic) | 明細ファイルの構造化データ抽出 | API仕様変更・料金改定の可能性。ブラウザから直接呼び出すため、通信はTLSで暗号化されるがAPIキーはクライアント側に存在する(5章参照) |
| GitHub Pages | 静的サイトホスティング | 無料。GitHubのサービス障害時はサイトにアクセスできない(オフラインキャッシュがあれば既存データの閲覧は可能な場合がある) |

## 7. セキュリティアーキテクチャ概要

- **認証情報の非保持**: 銀行・カードのログイン情報はアプリ内のどこにも保存しない(常に新規タブでの手動入力のみ、ネイティブ版から変更なし)
- **APIキー管理**: Anthropic APIキーはユーザーが設定画面から入力し、IndexedDBに保存する。**Keychainのようなハードウェア保護は無い**ため、ネイティブ版より保護レベルは下がる。個人が自分の端末でのみアクセスするPWAである(URLを公開・共有しない)ことを前提としたリスク許容とする
- **`dangerouslyAllowBrowser`について**: Anthropic公式SDKがこの名称を付けている理由は、公開Webサービスでクライアント側にAPIキーを埋め込むと、ブラウザの開発者ツールから第三者に読み取られ得るため。本アプリは個人専用・非公開のPWAであり、この用途では許容されるリスクと判断する
- **通信の暗号化**: Claude API・GitHub Pages・各金融機関サイトとの通信はいずれもTLSで暗号化される
- **送信データの最小化**: Claude APIへは明細ファイルの内容(店名・金額・日付)のみを送信し、口座番号等の機微情報は事前にマスキングすることを推奨(運用上の対策、要件定義書5.1参照)
- **ローカルデータの永続性リスク**: iOS Safariには一定期間操作が無いサイトのローカルストレージ(IndexedDB含む)を消去することがあるという既知の制約がある。データ消失に備え、エクスポート/インポート(バックアップ)機能をv1スコープに含める(design.md参照)
