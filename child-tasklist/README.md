# 遠征タスクリスト Web App(PWA)

子どもが遠征中にやることをチェックリスト化し、親のスマホ・子のスマホ間で共有するアプリ。詳細な設計は `docs/requirements.md` / `docs/architecture.md` / `docs/design.md` を参照。

家計簿アプリ(`../web/`)と異なり、親子間のデータ同期とプッシュ通知配信のために **Supabase**(本アプリ専用の新規プロジェクト)をバックエンドとして利用する。

## 1. Supabaseプロジェクトの準備

1. https://supabase.com でアカウント作成し、**本アプリ専用の新規プロジェクト**を作成する(既存プロジェクトとはDB容量・データを分離するため)
2. プロジェクト作成後、Settings > API から以下を控えておく
   - `Project URL`
   - `anon public` key
3. Database > Extensions で `pg_cron` と `pg_net` を有効化する

## 2. スキーマの適用

SQL Editorで `supabase/migrations/` 配下のファイルを**番号順に**そのまま実行する(`0001_init.sql` → `0002_reminder_interval.sql` → ...)。Supabase CLIでリンクして`supabase db push`する方法でも可。

新しいマイグレーションファイルが追加された場合は、既存環境でもそのファイルだけを追加で実行すればよい(`0001`から再実行する必要はない)。

## 3. VAPID鍵の生成

```bash
npx web-push generate-vapid-keys
```

- 表示された **Public Key** → フロントエンドの環境変数 `VITE_VAPID_PUBLIC_KEY` に設定
- 表示された **Private Key** → 手順4のEdge Function シークレット `VAPID_PRIVATE_KEY` に設定

## 4. Edge Functionsのデプロイ

```bash
cd child-tasklist
npx supabase login
npx supabase link --project-ref <あなたのプロジェクトref>
npx supabase functions deploy send-reminders
npx supabase functions deploy notify-check

# シークレット(Edge Functionの実行環境にのみ渡る。フロントエンドには公開されない)
npx supabase secrets set VAPID_PUBLIC_KEY=<手順3の公開鍵>
npx supabase secrets set VAPID_PRIVATE_KEY=<手順3の秘密鍵>
npx supabase secrets set VAPID_SUBJECT=mailto:<あなたのメールアドレス>
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` はEdge Function実行環境に自動的に注入されるため、手動設定は不要。

## 5. pg_cron・Database Webhookの設定

`supabase/post-setup.sql` を開き、`<PROJECT_REF>` / `<ANON_KEY>` を実際の値に置き換えたうえで、SQL Editorで実行する。

- リマインド送信(`send-reminders`)を10分毎に自動実行する pg_cron ジョブ
- チェック時(`daily_task_status`更新時)に `notify-check` を即座に呼び出すトリガー

が設定される。

## 6. フロントエンドのローカル開発

```bash
cd child-tasklist
cp .env.example .env   # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_VAPID_PUBLIC_KEY を実際の値に書き換える
npm install
npm run dev        # ローカル開発サーバー(http://localhost:5173)
npm run typecheck  # 型チェックのみ
npm run build       # 本番ビルド(dist/に出力)
npm run lint        # oxlintによる静的解析
```

Push通知はローカルの `http://localhost` でも動作するが、iOSでの動作確認は本番デプロイ後(HTTPS + ホーム画面追加)が必要。

## 7. GitHub Pagesへのデプロイ

`.github/workflows/deploy.yml` が `web/` と `child-tasklist/` の両方をビルドし、同一のGitHub Pagesサイトへ `/`(家計簿)と `/child-tasklist/`(本アプリ)としてまとめてデプロイする。

ビルド時に本アプリの環境変数を埋め込むため、リポジトリの Settings > Secrets and variables > Actions で以下を設定する。

| Secret名 | 値 |
|---|---|
| `CHILD_TASKLIST_SUPABASE_URL` | 手順1の Project URL |
| `CHILD_TASKLIST_SUPABASE_ANON_KEY` | 手順1の anon public key |
| `CHILD_TASKLIST_VAPID_PUBLIC_KEY` | 手順3の Public Key |

## 8. 使い方(初回セットアップ)

1. 親のiPhoneでデプロイ後のURL(`https://<ユーザー名>.github.io/<リポジトリ名>/child-tasklist/`)をSafariで開く
2. 共有ボタン → 「ホーム画面に追加」→ ホーム画面のアイコンから起動し直す(iOSはホーム画面追加後のPWAでのみプッシュ通知が届く)
3. 「親として家族を作る」を選び、名前を入力すると招待コードが発行される
4. 通知許可のボタンをタップして通知を有効化する
5. 「項目設定」タブから朝・昼・晩のチェックリスト項目を追加する
6. 子どものiPhoneでも同じURLを開き、ホーム画面に追加→起動し直す
7. 「招待コードで子として参加する」から手順3の招待コードを入力して参加する
8. 子ども側でも通知許可のボタンをタップする

## 重要な注意事項

- プッシュ通知は **iOS Safari 16.4以降** かつ **ホーム画面に追加したPWA** でのみ動作する。通常のSafariタブでは通知が届かない
- 通知の許可はボタンタップなどのユーザー操作からのみ要求できる(自動ポップアップは不可)
- v1では親・子とも1台の端末での利用を前提とする(同じ役割で複数端末に参加した場合の動作は未検証)
- Push購読情報(`members.push_subscription`)が失効した場合、Edge Function側で自動的にクリアされる。通知が届かなくなった場合はアプリを開き直して再度通知を有効化すること

## ディレクトリ構成

```
src/
  types/models.ts        データモデル(docs/design.md 2章)
  lib/
    supabaseClient.ts     Supabaseクライアント・匿名認証
    family.ts              家族の作成・参加ロジック
    push.ts                 Push購読登録
    useTodayChecklist.ts    当日チェックリストの取得・Realtime購読・チェック更新
    dateUtils.ts             日付・時刻フォーマット
  sw.ts                     Service Worker(Push受信・通知表示)
  views/                     画面ごとのコンポーネント(docs/design.md 1章の画面一覧に対応)
supabase/
  migrations/0001_init.sql   スキーマ・RLS定義
  functions/send-reminders    リマインド送信Edge Function(pg_cronから起動)
  functions/notify-check       完了通知Edge Function(Database Webhookから起動)
  post-setup.sql               pg_cron・Webhookトリガーのセットアップ用SQL
```

## 既知の制約・未実装(v1スコープ外)

`docs/design.md` 7章、`docs/requirements.md` 5章を参照。
