# 家計簿 Web App(PWA)

個人用の半自動家計簿アプリ。Mac非保有のため、iOSネイティブではなく **Vite + React + TypeScript** によるPWA(Progressive Web App)として実装している。詳細な設計は `../docs/requirements.md` / `../docs/architecture.md` / `../docs/design.md` を参照。

## セットアップ

```bash
cd web
npm install
npm run dev       # ローカル開発サーバー(http://localhost:5173)
npm run typecheck # 型チェックのみ
npm run build     # 本番ビルド(dist/に出力)
npm run lint      # oxlintによる静的解析
```

## デプロイ(GitHub Pages)

`.github/workflows/deploy-web.yml` により、`claude/household-budget-app-6ad06r`ブランチ(このリポジトリのデフォルトブランチ)の`web/`配下への変更をpushすると自動的にGitHub Pagesへデプロイされる。初回のみ、リポジトリの Settings → Pages → Source を **GitHub Actions** に設定する必要がある(設定済み)。

デプロイ後のURLは `https://<GitHubユーザー名>.github.io/<リポジトリ名>/` となる。

## iPhoneへのインストール

1. デプロイされたURLをiPhoneのSafariで開く
2. 共有ボタン → 「ホーム画面に追加」
3. ホーム画面のアイコンから、ブラウザのUIが無いアプリのような見た目で起動できる

## 初回設定

1. 「設定」タブでAnthropic APIキーを入力・保存する(ブラウザのIndexedDBに保存される。Keychainのような保護は無い点に注意 — architecture.md 7章参照)
2. 「設定 > 取り込み元管理」で、三菱UFJの2口座・楽天カード・PayPayカードそれぞれの明細ページURLを登録する
3. 「設定 > カテゴリ・予算管理」で、初期カテゴリ(自動投入済み)ごとに月次予算額を設定する

## 重要な注意事項

- **定期的にバックアップを取ってください**(「設定 > バックアップ/復元」)。iOS Safariは一定期間操作の無いサイトのローカルストレージを消去することがあり、家計簿データが消える可能性がある(design.md 8章)。
- Anthropic APIキーはブラウザ内に保存され、Claude APIへの通信はブラウザから直接行われる(`dangerouslyAllowBrowser`)。本アプリを公開・共有しないこと。

## ディレクトリ構成

```
src/
  types/models.ts          データモデル(docs/design.md 2章)
  lib/
    db.ts                  IndexedDB(Dexie)スキーマ定義
    dateUtils.ts           日付フォーマット・月次計算ユーティリティ
    budgetCalculator.ts    予算・実績集計ロジック(docs/design.md 3章)
    categoryResolver.ts    カテゴリ自動判定ロジック(docs/design.md 4.4)
    claudeExtractionService.ts  Claude API連携(docs/design.md 4章)
    seedData.ts            初期カテゴリのシード投入
    keyStorage.ts           APIキー等の設定値保存
    backup.ts               バックアップ・復元(docs/design.md 8章)
  views/                    画面ごとのコンポーネント(docs/design.md 1章の画面一覧に対応)
  components/               共通UIパーツ(タブバー、月選択、取引行)
```

## 既知の制約・未実装(v1スコープ外)

`docs/design.md` 9章、`docs/requirements.md` 6章を参照。
