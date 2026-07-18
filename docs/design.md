# 詳細設計書 — 個人用家計簿アプリ

version: 0.3(ドラフト)。要件定義書(`requirements.md`)・システム構成書(`architecture.md`)を前提とする。

## 1. 画面一覧・遷移

```mermaid
flowchart LR
    Home["ホーム<br/>(対予算・対収入サマリー)"] --> DailyList["日次収支リスト"]
    Home --> BudgetView["月次予実画面<br/>(カテゴリ別 予算・実績)"]
    BudgetView -->|実績タップ| CategoryDrilldown["カテゴリ別取引一覧"]
    Home --> ImportSelect["取り込み元選択"]
    ImportSelect --> SafariSheet["SFSafariViewController<br/>(明細ページ)"]
    SafariSheet -->|シートを閉じる| FilePicker["ファイル選択画面<br/>(UIDocumentPicker)"]
    FilePicker --> Preview["抽出結果プレビュー"]
    Preview -->|確定| DailyList
    DailyList --> Detail["取引詳細・編集"]
    CategoryDrilldown --> Detail
    Home --> Settings["設定"]
    Settings --> CategoryManage["カテゴリ・予算管理"]
    Settings --> SourceManage["取り込み元URL管理"]
```

| 画面 | 概要 |
|---|---|
| ホーム | 月選択+当月の支出合計・収入合計・対予算/対収入の割合を表示するトップ画面(要件定義書 4.7) |
| 日次収支リスト | 選択月の収支を日付ごとにグルーピングして一覧表示(要件定義書 4.4) |
| 月次予実画面 | カテゴリごとの予算額・実績額・残額/達成率を一覧表示(要件定義書 4.5) |
| カテゴリ別取引一覧 | 月次予実画面で実績をタップした際の内訳(日次収支リストをカテゴリで絞り込んだもの) |
| 取引詳細・編集 | 個別取引のカテゴリ変更・金額修正・削除 |
| 取り込み元選択 | 三菱UFJ(2口座)・楽天カード・PayPayカードから選択 |
| SFSafariViewControllerシート | 各機関の明細ページ(手動ログイン・ダウンロード操作) |
| ファイル選択画面 | ダウンロード済みファイルを`UIDocumentPicker`で選択 |
| 抽出結果プレビュー | Claude APIの抽出結果を確認・修正して確定登録 |
| カテゴリ・予算管理 | カテゴリの追加・編集・削除、カテゴリごとの月次予算額の設定(要件定義書 4.6) |
| 設定 | Anthropic APIキー入力(Keychain保存)、取り込み元ディープリンクURLの管理 |

## 2. データモデル

```swift
// 収入・支出の区分
enum TransactionType: String, Codable {
    case income   // 収入(三菱UFJ銀行口座の入金)
    case expense  // 支出(銀行口座の出金・カード利用)。カード返金等の例外時はamountが負の値になる
}

// 大カテゴリ(自由入力ではなく、あらかじめ定義された一覧から選択する。要件定義書 4.3/4.6)
// 予算(CategoryBudgetSetting)はこの大カテゴリ単位で設定する
struct MajorCategory: Codable, Identifiable {
    let id: UUID
    var name: String        // 例: "食費"
    var displayOrder: Int
}

// 小カテゴリ(大カテゴリに紐づく。要件定義書 8章の初期カテゴリ一覧を参照)
struct Subcategory: Codable, Identifiable {
    let id: UUID
    var majorCategoryID: MajorCategory.ID
    var name: String         // 例: "食料品"、"カフェ"
    var displayOrder: Int
}

// カテゴリごとの月次予算設定(大カテゴリ単位)
// 変更履歴を保持し、過去月の予実評価には遡って適用しない(要件定義書 4.6)
struct CategoryBudgetSetting: Codable, Identifiable {
    let id: UUID
    var majorCategoryID: MajorCategory.ID
    var monthlyAmount: Double
    var effectiveFrom: Date   // この日付が属する月以降に適用される。それより前の月には影響しない
}

// 店名 → カテゴリ の学習マッピング(要件定義書 4.9)
// ユーザーが手動でカテゴリを修正すると upsert され、次回以降の自動判定で最優先される
struct MerchantCategoryMapping: Codable, Identifiable {
    let id: UUID
    var merchantKey: String        // 店名(完全一致で判定。正規化ルールは6章参照)
    var subcategoryID: Subcategory.ID
    var updatedAt: Date
}

// 取引データ
struct Transaction: Codable, Identifiable {
    let id: UUID
    var date: Date
    var merchant: String              // 店名・利用先(収入の場合は振込元等の摘要)
    var amount: Double                // 支出は基本プラス。カード返金等の例外時はマイナス。収入は常にプラス
    var type: TransactionType
    var subcategoryID: Subcategory.ID?  // 支出のみ設定対象。未設定は「未分類」として扱う(収入では使用しない)。大カテゴリはSubcategory.majorCategoryIDから引く
    var sourceInstitutionID: FundingSource.ID  // どの取り込み元から来たか(=日次リストの「支払情報」表示に使う)
    var memo: String?
    var importedAt: Date              // 取り込み日時(重複検知の補助情報)
}

// 取り込み元(金融機関・カード)の設定
struct FundingSource: Codable, Identifiable {
    let id: UUID
    var displayName: String     // 例: "三菱UFJ 普通口座(給与用)"
    var kind: FundingSourceKind
    var statementDeepLinkURL: URL   // 明細ページへの直リンク
}

enum FundingSourceKind: String, Codable {
    case bankAccount   // 三菱UFJの各口座
    case creditCard    // 楽天カード・PayPayカード
}
```

**三菱UFJの2口座の扱い**: `FundingSource` を口座単位で2件登録する(例: 「三菱UFJ 普通口座A」「三菱UFJ 普通口座B」)。ディープリンクは共通の明細照会画面URLとし、口座選択自体はSafari上でユーザーが手動で行う想定(要件定義書7章の未決事項も参照)。

**カテゴリと予算を分離した理由**: `MajorCategory`(名称・表示順)と`CategoryBudgetSetting`(金額・適用開始日)を別モデルにしているのは、予算額の変更履歴を保持するため。単純に`MajorCategory`に`monthlyAmount`を1つだけ持たせると、変更時に過去月の評価まで書き換わってしまう(要件定義書 4.6で明示的に否定された挙動)。

**大カテゴリ・小カテゴリを分けた理由**: 予算管理(4.5/4.6)は大カテゴリ単位で行う一方、取引ごとの分類(4.9のカテゴリ自動判定)はより粒度の細かい小カテゴリで行いたいため、2階層構造にしている。大カテゴリの実績集計は「そのカテゴリに属する全小カテゴリのTransactionを合算」して求める(3.2参照)。

## 3. 予算・実績集計ロジック

### 3.1 対象月に適用される予算額の決定

`CategoryBudgetSetting`は変更のたびに新しいレコードを追加し(既存レコードを上書きしない)、`effectiveFrom`でいつから有効かを表す。対象月の予算額は「その月の月初時点で最も新しく有効だった設定」を採用する。

```swift
/// 指定した大カテゴリ・月に適用される予算額を取得する
/// (過去に確定した月の表示は、後から予算を変更しても変わらない)
func budgetAmount(
    for majorCategoryID: MajorCategory.ID,
    month: Date,
    settings: [CategoryBudgetSetting]
) -> Double? {
    let monthStart = startOfMonth(month)
    return settings
        .filter { $0.majorCategoryID == majorCategoryID && $0.effectiveFrom <= monthStart }
        .max(by: { $0.effectiveFrom < $1.effectiveFrom })?
        .monthlyAmount
}
```

- 予算を編集した場合、新しい`CategoryBudgetSetting`の`effectiveFrom`は「編集した時点が属する月の月初」とする → **編集した当月と将来月には新しい金額が適用され、それより前の月は編集前の金額のまま**になる
- 該当する設定が1件も無いカテゴリ(予算未設定)は「予算額なし」として月次予実画面に表示する(0円として達成率を計算しない)

### 3.2 月次実績額(支出)の集計

大カテゴリの実績は、そのカテゴリに属する全小カテゴリのTransactionを合算して求める。

```swift
func actualAmount(
    for majorCategoryID: MajorCategory.ID,
    month: Date,
    transactions: [Transaction],
    subcategories: [Subcategory]
) -> Double {
    let subcategoryIDs = Set(subcategories.filter { $0.majorCategoryID == majorCategoryID }.map(\.id))
    return transactions
        .filter { $0.type == .expense && isSameMonth($0.date, month) }
        .filter { tx in tx.subcategoryID.map(subcategoryIDs.contains) ?? false }
        .reduce(0) { $0 + $1.amount }   // カード返金(マイナス値)も合算され、実績額が相殺される
}
```

### 3.3 月次サマリー(対予算・対収入)の計算

```swift
func monthlySummary(month: Date, transactions: [Transaction], budgetSettings: [CategoryBudgetSetting], majorCategories: [MajorCategory]) -> MonthlySummary {
    let monthTx = transactions.filter { isSameMonth($0.date, month) }
    let totalExpense = monthTx.filter { $0.type == .expense }.reduce(0) { $0 + $1.amount }
    let totalIncome = monthTx.filter { $0.type == .income }.reduce(0) { $0 + $1.amount }
    let totalBudget = majorCategories
        .compactMap { budgetAmount(for: $0.id, month: month, settings: budgetSettings) }
        .reduce(0, +)

    return MonthlySummary(
        totalExpense: totalExpense,
        totalIncome: totalIncome,
        totalBudget: totalBudget,
        budgetUsageRate: totalBudget > 0 ? totalExpense / totalBudget : nil,   // 対予算
        incomeUsageRate: totalIncome > 0 ? totalExpense / totalIncome : nil,  // 対収入
        savings: totalIncome - totalExpense
    )
}

struct MonthlySummary {
    let totalExpense: Double
    let totalIncome: Double
    let totalBudget: Double
    let budgetUsageRate: Double?   // 支出 ÷ 予算合計
    let incomeUsageRate: Double?   // 支出 ÷ 収入合計
    let savings: Double            // 収入 - 支出
}
```

## 4. Claude API連携仕様

### 4.1 リクエスト方針

- モデル: `claude-haiku-4-5`(既定)。抽出精度に問題がある場合は `claude-sonnet-5` に切り替え可能な設定項目とする
- PDFはbase64エンコードして `document` コンテンツブロックとして送信。CSVはテキストとしてそのままプロンプトに含める
- 構造化出力(`output_config.format`)でJSON Schemaを指定し、パース失敗を防ぐ
- 支払方法(一括・分割等)は抽出対象としない(要件定義書 4.2)
- 支出については、店名から大カテゴリ・小カテゴリの候補も併せて推定させる(要件定義書 4.9)

### 4.2 抽出スキーマ

```json
{
  "type": "object",
  "properties": {
    "transactions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "date": { "type": "string", "format": "date" },
          "merchant": { "type": "string" },
          "amount": { "type": "number" },
          "type": { "type": "string", "enum": ["income", "expense"] },
          "majorCategory": {
            "type": ["string", "null"],
            "enum": ["食費", "日用雑貨", "交通", "エンタメ", "教育", "美容・衣服", "医療・保健", "通信", "水道・光熱", "車", "その他", "交際費", "税金", "大型出費", null]
          },
          "subcategory": { "type": ["string", "null"] }
        },
        "required": ["date", "merchant", "amount", "type", "majorCategory", "subcategory"],
        "additionalProperties": false
      }
    }
  },
  "required": ["transactions"],
  "additionalProperties": false
}
```

- 三菱UFJ銀行の明細(入金・出金を含む)を渡す際は、プロンプトで「入金は`income`、出金は`expense`として分類してください」と明示する。楽天カード・PayPayカードの明細を渡す際は「原則すべて`expense`とし、返金と判断できる行は金額をマイナス値にしてください」と指示する
- `type`が`income`の場合、`majorCategory`/`subcategory`は`null`を返させる(要件定義書 4.5: 予実管理は支出のみが対象)
- `majorCategory`の`enum`は、実装時に**登録済みの`MajorCategory`一覧から動的に生成する**(ハードコードしない)。カテゴリは4.6の機能で後から追加できるため、追加された大カテゴリも次回リクエストから自動的に選択肢へ反映される
- `subcategory`はJSON Schemaでの列挙(enum)は行わず自由文字列とし、プロンプト側で「指定した大カテゴリに属する小カテゴリ一覧から選んでください」と指示する。アプリ側で該当する`Subcategory`が実在するか検証し、一致しなければ次項のロジックで「未分類」にフォールバックする

### 4.3 レスポンス処理

```swift
struct ExtractionResult: Codable {
    struct Item: Codable {
        let date: String
        let merchant: String
        let amount: Double
        let type: TransactionType
        let majorCategory: String?
        let subcategory: String?
    }
    let transactions: [Item]
}

func extractTransactions(fileData: Data, mimeType: String, sourceID: FundingSource.ID) async throws -> [Transaction] {
    // 1. Claude APIへリクエスト(document or text content block + output_config.format)
    // 2. レスポンスをExtractionResultにデコード
    // 3. ExtractionResult.Item を Transaction に変換
    //    (subcategoryIDは4.4のresolveCategoryで決定。sourceInstitutionID・importedAtを付与)
}
```

### 4.4 カテゴリ自動判定ロジック(学習マッピング優先)

要件定義書 4.9の優先順位(①学習マッピング → ②Claudeの推定 → ③未分類)を実装するロジック。抽出結果1件ごとに、最終的な小カテゴリを決定する。

```swift
/// 優先順位: ①学習マッピング(店名の完全一致) → ②Claudeによる推定 → ③未分類(nil)
func resolveCategory(
    merchant: String,
    claudeSuggestedMajor: String?,
    claudeSuggestedSub: String?,
    mappings: [MerchantCategoryMapping],
    subcategories: [Subcategory],
    majorCategories: [MajorCategory]
) -> Subcategory.ID? {
    // 1. 学習マッピングを最優先
    if let learned = mappings.first(where: { $0.merchantKey == merchant }) {
        return learned.subcategoryID
    }

    // 2. Claudeの推定(大カテゴリ名+小カテゴリ名から該当Subcategoryを検索)
    if let majorName = claudeSuggestedMajor,
       let subName = claudeSuggestedSub,
       let major = majorCategories.first(where: { $0.name == majorName }),
       let sub = subcategories.first(where: { $0.majorCategoryID == major.id && $0.name == subName }) {
        return sub.id
    }

    // 3. 未分類
    return nil
}
```

- プレビュー画面には`resolveCategory`の結果を初期値として表示し、ユーザーはそのまま確定するか手動修正できる
- ユーザーが手動修正した場合、`MerchantCategoryMapping`を`merchant`をキーに **upsert**(既存があれば`subcategoryID`と`updatedAt`を更新、無ければ新規作成)する。これにより同一店名の次回以降の取引は学習マッピングが最優先で適用される

## 5. インポートフロー詳細

1. ユーザーが「取り込み元選択」画面で機関を選ぶ
2. 対応する `FundingSource.statementDeepLinkURL` を `SafariView`(`SFSafariViewController`のラッパー、`docs/sfsafariviewcontroller.md`参照)に渡してシート表示
3. ユーザーが手動でログイン・(必要なら「デスクトップサイト表示」に切り替え)・明細画面へ遷移・CSV/PDFをダウンロード
4. ユーザーがシートを閉じる(`SFSafariViewControllerDelegate.safariViewControllerDidFinish`を検知)
5. アプリがファイル選択画面(`UIDocumentPicker`)を表示し、iOSの「ダウンロード」フォルダ等から該当ファイルを選択させる
6. 選択されたファイルを読み込み、Claude APIへ送信
7. 抽出結果をプレビュー画面に表示。既存データとの重複候補(日付+店名+金額の一致)がある場合はハイライト表示。カテゴリ(支出のみ)は`4.4`の`resolveCategory`により自動で初期値が入力された状態で表示され、ユーザーはそのまま確定するか手動修正できる
8. ユーザーが確認・修正のうえ「確定」を押すと、修正の有無に応じて`MerchantCategoryMapping`をupsertしたうえでローカルDBに保存

## 6. エラーハンドリング方針

| ケース | 対応 |
|---|---|
| Claude API通信エラー(ネットワーク不通・タイムアウト) | エラーメッセージを表示し、再試行ボタンを提示 |
| APIキー未設定・無効 | 設定画面への導線を表示 |
| 抽出結果のJSON Schema不一致・パース失敗 | 生のレスポンステキストを表示し、手動確認を促す(サイレントに失敗させない) |
| ファイル形式非対応(CSV/PDF以外) | ファイル選択時点でMIMEタイプを検証し、対応形式のみ選択可能にする |
| 明細ページのURL失効(サイト側のリニューアル等) | 設定画面からディープリンクURLを手動更新できるようにする |

## 7. ローカルストレージ設計(仮: SwiftData)

- `Transaction` / `FundingSource` / `MajorCategory` / `Subcategory` / `CategoryBudgetSetting` / `MerchantCategoryMapping` をそれぞれ `@Model` クラスとして永続化(SwiftDataは`struct`ではなく`class`+`@Model`を要求するため、上記の`struct`定義は実装時に`@Model class`へ変換する)
- 初回起動時に、要件定義書 8章の初期カテゴリ一覧(14の大カテゴリとその小カテゴリ)を`MajorCategory`/`Subcategory`としてシード投入する
- 重複検知は取り込み時に「日付・店名・金額が完全一致する既存レコード」を検索し、プレビュー画面で警告表示する(あいまい一致は将来検討)
- `CategoryBudgetSetting`は上書きせず追加型で保存し、`3.1`のロジックで対象月の予算額を都度算出する(削除もユーザー操作としては提供しない想定 — 誤って過去の履歴を消すと過去月の予実表示が変わってしまうため)
- `MerchantCategoryMapping`は`merchantKey`(店名の完全一致)を実質的な一意キーとして扱い、手動修正のたびに同一店名のレコードがあれば更新、無ければ新規作成する(upsert)
- バックアップ: 初期版ではiCloudバックアップ対象に含めるのみとし、明示的なエクスポート機能は将来検討とする

## 8. 将来拡張ポイント(v1スコープ外)

- Share Extensionによる「ダウンロード→即インポート」の半自動化
- 学習マッピングのあいまい一致対応(表記ゆれの吸収)
- 複数月・複数ファイルの一括インポート
- グラフ・集計機能の充実(週次表示、予算アラート等)
- データエクスポート(CSV/他アプリ連携)
- カテゴリ削除時に紐づく`CategoryBudgetSetting`・`Transaction.subcategoryID`・`MerchantCategoryMapping`をどう扱うか(現状は未設計)
