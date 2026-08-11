# サッカーハイライト作成ツール

YouTubeにアップロードされた試合動画を見ながら「開始〜終了」のタイムスタンプでシーンをタグ付けし、
切り抜き・並べ替え・結合・(必要なら)音楽への差し替えを行ってハイライト動画を作るためのツール。

`web/`(家計簿PWA)や`child-tasklist/`とは異なり、**GitHub Pagesにはデプロイしないローカル専用アプリ**。
YouTube動画のダウンロードや動画の切り抜き・結合には`yt-dlp`と`ffmpeg`が必要で、これらはブラウザ内(静的サイト)
だけでは実行できないため、ローカルで動くExpressサーバーを併用する構成になっている。

## できること

- YouTubeの動画をブラウザ埋め込みプレーヤーで再生しながら、現在の再生位置で「区間開始」「区間終了」を押してクリップをタグ付け
- 複数のYouTube URLを読み込んで、それぞれから別々にクリップを切り出し可能
- クリップの一覧表示、順序の入れ替え(↑↓)、削除、ラベル編集
- クリップを指定順に結合してハイライト動画を書き出し、ローカル(`data/output/`)に保存
- 書き出した動画をYouTubeにアップロード(非公開/限定公開/公開を選択可)
- mp3を指定して、書き出した動画の音声トラックを丸ごと差し替え(BGMループ、動画の長さに自動調整)

## 前提ソフトウェア(事前にインストールが必要)

- Node.js 22系(`web/`と同じ)
- [ffmpeg](https://ffmpeg.org/download.html)(切り抜き・結合・音声差し替えに使用)
  - macOS: `brew install ffmpeg`
  - Windows: `winget install ffmpeg` または公式サイトからバイナリ取得しPATHに追加
  - Linux: `sudo apt install ffmpeg` 等
- [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation)(YouTube動画のダウンロードに使用)
  - macOS: `brew install yt-dlp`
  - Windows: `winget install yt-dlp`
  - Linux/pip: `pip install -U yt-dlp`
  - YouTube側の仕様変更で失敗するようになった場合は `yt-dlp -U` で更新する

いずれもコマンドラインで `ffmpeg -version` / `yt-dlp --version` が通ることを確認してから使うこと。

## セットアップ

```bash
cd soccer-highlights
npm install
```

## 開発時の起動(2プロセス: フロントエンド + APIサーバー)

```bash
npm run dev
```

- フロントエンド(Vite): http://localhost:5173 を開く
- APIサーバー(Express): http://localhost:8787 で待ち受け、Viteが`/api`をここにプロキシする

## ローカルでの本番相当起動(1プロセス)

```bash
npm run build
npm start
```

http://localhost:8787 を開く(ビルド済みフロントエンドをExpressが配信し、同じプロセスでAPIも動く)。

## 使い方

1. 試合動画のYouTube URLを貼り付けて「読み込む」
2. 動画を再生しながら見たい場面で「区間開始」→ 該当シーンの終わりで「区間終了してクリップ追加」
3. 別のYouTube URL(別の試合・別アングルなど)を読み込むと、続けてそこからもクリップを追加できる
4. クリップ一覧で順序を↑↓で入れ替え、不要なものは削除、名前も編集可能
5. 「書き出し」でファイル名を入力し、必要なら差し替え用のmp3を選択して「書き出し開始」
   - 元動画のダウンロード → 各クリップの切り出し → 結合 → (mp3指定時)音声差し替え、の順に進み進捗が表示される
   - 完了すると`data/output/`にmp4として保存され、ダウンロードリンクが表示される
6. そのままYouTubeにアップロードする場合は、完了後に表示される「YouTubeにアップロード」パネルを使う
   (初回は認証設定が必要。下記参照)

## YouTubeアップロード設定(任意)

書き出した動画をアプリから直接YouTubeにアップロードしたい場合のみ設定する。ローカル保存だけで良ければ不要。

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
2. 「APIとサービス」→「ライブラリ」で **YouTube Data API v3** を有効化
3. 「APIとサービス」→「OAuth同意画面」を設定(テストユーザーとして自分のGoogleアカウントを追加すればOK。外部公開審査は不要)
4. 「認証情報」→「OAuthクライアントID」を作成(アプリケーションの種類: ウェブアプリケーション)
   - 承認済みのリダイレクトURIに `http://localhost:8787/api/youtube/oauth2callback` を追加
5. 発行された「クライアントID」「クライアントシークレット」を`soccer-highlights/.env`に設定
   (`.env.example`をコピーして使う)

   ```bash
   cp .env.example .env
   # .env を編集してGOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を入力
   ```

6. アプリの書き出し完了後、「YouTubeにログイン」ボタンから認証(初回のみ)。認証情報は
   `data/youtube-token.json`にローカル保存される(Gitには含めない)

## 注意事項

- **著作権・利用規約**: 自分の子供の試合を自分でYouTubeに投稿した動画をダウンロードして個人用ハイライトを
  作る分には実用上問題になりにくいが、YouTube利用規約上、動画のダウンロード自体はグレーな行為とされている。
  他人が撮影・投稿した動画や、著作権のある音楽をBGMとして使う場合は権利関係に注意すること。
- クリップの切り抜きはフレーム精度のため**再エンコード**を行う(コピーだけの結合より時間がかかる)。
  試合動画が長い・クリップ数が多いほど書き出しに時間がかかる。
- 音声差し替えは動画の音声トラックを丸ごとmp3に置き換える(元の実況・歓声などは残らない)。
- ブラウザをリロードするとクリップ一覧は失われる(v1では保存・永続化はしていない)。書き出しが終わってから
  リロードすること。

## ディレクトリ構成

```
soccer-highlights/
  src/                       フロントエンド(React)
    components/              YouTubeプレーヤー、クリップタグ付け、一覧、書き出しパネル等
    lib/                     API呼び出し、YouTube IFrame API読み込み
  server/src/                バックエンド(Express)
    routes/                  /api/sources, /api/export, /api/output, /api/youtube
    lib/                     yt-dlp/ffmpeg呼び出し、ジョブ進捗管理、YouTube OAuth
  data/                      実行時に生成(Git管理外)
    downloads/                yt-dlpでダウンロードした元動画のキャッシュ(videoId単位)
    output/                   書き出し済みハイライト動画(ローカル保存先)
    tmp/                      書き出し処理中の一時ファイル
```
