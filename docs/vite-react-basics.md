# Vite / React 基礎知識まとめ(家計簿アプリ開発向け)

このアプリ(`web/`)で実際に使っている範囲に絞って説明します。Swiftの基礎(`swift-basics.md`相当)のWeb版です。

## 1. Viteとは

**Vite(ヴィート)** は「開発サーバー」と「ビルドツール」を兼ねたツールです。

- **開発時**(`npm run dev`): ソースコードを変更した瞬間にブラウザへ反映される(Hot Module Replacement)。ファイルを1つずつ必要な時にだけ変換するので起動が速い
- **本番ビルド時**(`npm run build`): TypeScriptのコンパイル、複数ファイルの1つ(または少数)のJSファイルへの結合(バンドル)、不要コードの削除などを行い、`web/dist/`に静的ファイル一式を出力する

GitHub Pagesが配信するのはこの`dist/`の中身であり、`src/`のソースコードそのものではありません(GitHub Actionsを使う理由も参照)。

`web/vite.config.ts`が設定ファイルです:

```typescript
export default defineConfig({
  base: "./",              // 相対パスで出力(GitHub Pagesのサブパスでも壊れないように)
  plugins: [
    react(),                // Reactのコードを理解できるようにするプラグイン
    VitePWA({ ... }),       // PWA化(マニフェスト・Service Worker生成)のプラグイン
  ],
});
```

## 2. Reactとは

**React**は「UIを部品(コンポーネント)の組み合わせとして作る」ためのライブラリです。

### コンポーネント = 関数

`web/src/components/MonthPicker.tsx`を例にすると:

```tsx
interface Props {
  month: Date;
  onChange: (month: Date) => void;
}

export default function MonthPicker({ month, onChange }: Props) {
  return (
    <div className="month-picker">
      <button onClick={() => onChange(...)}>‹</button>
      <strong>{formatYearMonth(month)}</strong>
      <button onClick={() => onChange(...)}>›</button>
    </div>
  );
}
```

- コンポーネントは「**引数(props)を受け取り、画面の見た目(JSX)を返す関数**」です
- `Props`という型でコンポーネントが受け取る値(データや、親に処理を伝えるための関数)を定義します
- `{formatYearMonth(month)}`のように、`{}`で囲むとJSXの中にJavaScript/TypeScriptの値・式を埋め込めます(これがJSXの基本ルール)

### 状態(useState)

`web/src/views/HomeView.tsx`より:

```tsx
const [month, setMonth] = useState(() => new Date());
```

- `month`が現在の値、`setMonth`がその値を更新するための関数
- `setMonth(...)`を呼ぶと、Reactが自動的にそのコンポーネントを**再描画**します(SwiftUIの`@State`と同じ考え方です)

### 副作用(useEffect)

`web/src/App.tsx`より:

```tsx
useEffect(() => {
  seedCategoriesIfNeeded().finally(() => setReady(true));
}, []);
```

- 「画面が表示された時に1回だけ実行したい処理」(API呼び出し、初期化処理など)を書く場所
- 第2引数の`[]`は「依存配列」。空配列は「初回表示時に1回だけ実行」を意味します

## 3. このアプリ特有の重要な仕組み

### `useLiveQuery`(データベースの自動反映)

```tsx
const transactions = useLiveQuery(() => db.transactions.toArray(), []);
```

これは`dexie-react-hooks`が提供するフックで、**IndexedDBの中身が変わると自動的にコンポーネントを再描画**してくれます。SwiftDataの`@Query`と同じ役割で、「取引を保存したら一覧画面に手動でリロードをかけなくても勝手に反映される」のはこの仕組みのおかげです。

### React Router(画面遷移)

`web/src/App.tsx`で使っている`HashRouter`/`Routes`/`Route`は、URLの一部(`#`以降)に応じて表示するコンポーネントを切り替える仕組みです。

```tsx
<Route path="/budget/:month" element={<MonthlyBudgetView />} />
```

`:month`の部分は可変パラメータで、`MonthlyBudgetView`側で`useParams()`を使って取り出します(`web/src/views/MonthlyBudgetView.tsx`参照)。`HashRouter`を使っている理由は、GitHub Pagesのような「サーバー側の設定をいじれない静的ホスティング」でも、リロード時に404にならないためです。

## 4. TypeScriptとの組み合わせ

`.tsx`拡張子のファイルは「JSX(HTMLっぽい記法)を含むTypeScriptファイル」という意味です。`interface Props { ... }`のようにコンポーネントの引数の型を明示することで、間違った値を渡すとビルド時(`npm run typecheck`)にエラーとして検出できます。

## 5. なぜGitHub Pagesの設定はGitHub Actionsが必要なのか(復習)

GitHub Pagesの「Source」には2つの選択肢があります。

| 選択肢 | 動作 |
|---|---|
| Deploy from a branch | 指定したブランチ/フォルダの中身をそのまま静的ファイルとして配信する。ビルド処理は一切行わない |
| GitHub Actions | 指定したワークフローを実行し、その成果物(ビルド後のファイル)を配信する |

このアプリはTypeScriptのコンパイルやバンドルといったビルド処理(`npm run build`)が必須なので、「Deploy from a branch」ではソースコードがそのまま配信されてしまい動作しません。`.github/workflows/deploy-web.yml`が`npm run build`を実行し、その結果(`web/dist/`)だけをデプロイする構成にしているのはこのためです。
