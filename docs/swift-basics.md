# Swift 基礎知識まとめ(家計簿アプリ開発向け)

このアプリ(個人用・iOS専用の家計簿アプリ)を作るために最低限必要なSwiftの知識をまとめました。Swift言語全体ではなく、このプロジェクトで実際に使う範囲に絞っています。

## 1. 変数と定数

```swift
var count = 0        // 変数(あとで変更できる)
let apiKey = "sk-..." // 定数(一度決めたら変更不可)
```

- 変更しないものは基本的に `let` を使う(バグを防ぐための慣習)
- 型は基本的に自動推論されるが、明示することもできる: `let amount: Double = 1200.0`

## 2. Optional(nilを安全に扱う仕組み)

Swiftで最初につまずきやすいポイントです。「値が無いかもしれない」ことを型で表現します。

```swift
var memo: String? = nil   // String? は「Stringかもしれないし、無い(nil)かもしれない」

// 安全な取り出し方
if let memo = memo {
    print(memo) // ここではmemoは必ずStringとして使える
}

// もっと簡潔に(guard: 条件を満たさなければ早期リターン)
func printMemo(_ memo: String?) {
    guard let memo = memo else { return }
    print(memo)
}

// ?? で「nilならデフォルト値」
let displayMemo = memo ?? "(メモなし)"
```

このアプリでは「CSVの一部の列が空欄」「Claudeの抽出結果に一部フィールドが無い」といった場面でOptionalを使うことになります。

## 3. 構造体(struct) — このアプリのデータの基本単位

家計簿の1件の取引データなどは `struct` で表現するのが基本です。

```swift
struct Transaction: Codable, Identifiable {
    let id: UUID
    let date: Date
    let merchant: String   // 店名
    let amount: Double     // 金額
    var category: String?  // カテゴリ(あとから編集可能なのでvar)
}
```

- `struct` は値型(コピーされる)。SwiftUIのデータは基本的にstructで持つ
- `class` は参照型(共有される)。複数箇所から同じインスタンスを操作したい場合(例: あとで出てくる `ObservableObject`)に使う
- `Codable` を付けると、JSON ⇄ Swiftの構造体の変換が自動でできる(Claude APIから返ってくるJSONをパースするのに必須)
- `Identifiable` を付けると、SwiftUIのリスト表示(`List`)でそのまま使える

## 4. 関数とクロージャ

```swift
func calculateTotal(transactions: [Transaction]) -> Double {
    transactions.reduce(0) { $0 + $1.amount }
}
```

`{ $0 + $1.amount }` の部分が**クロージャ**(その場で書く無名関数)。`$0`, `$1` は引数の省略記法です。SwiftUIのボタンのアクションなどでも頻繁に登場します。

```swift
Button("保存") {
    saveTransaction()  // これもクロージャ
}
```

## 5. SwiftUIの基本

SwiftUIは「状態(データ)が変わると、画面が自動で再描画される」仕組みです。

```swift
struct TransactionListView: View {
    @State private var transactions: [Transaction] = []

    var body: some View {
        List(transactions) { transaction in
            Text(transaction.merchant)
        }
    }
}
```

- `View` プロトコルに準拠した構造体が「画面の部品」
- `@State`: そのView内だけで完結する状態。値が変わると自動で再描画される
- `@Binding`: 親Viewから状態を受け取り、子Viewから変更できるようにする
- `@StateObject` / `@ObservedObject`: 複数画面をまたいで共有したい状態(class + `ObservableObject`)に使う。例えば「取引データ全体を管理するクラス」など
- 画面遷移: `NavigationStack`、モーダル表示: `.sheet(isPresented:)`(次のSFSafariViewControllerのドキュメントで使います)

## 6. 非同期処理(async/await)

Claude APIの呼び出しはネットワーク通信なので非同期処理になります。

```swift
func extractTransactions(from pdfData: Data) async throws -> [Transaction] {
    var request = URLRequest(url: URL(string: "https://api.anthropic.com/v1/messages")!)
    request.httpMethod = "POST"
    request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
    request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
    request.httpBody = try JSONEncoder().encode(buildRequestBody(pdfData))

    let (data, _) = try await URLSession.shared.data(for: request)
    let response = try JSONDecoder().decode(ClaudeResponse.self, from: data)
    return response.parsedTransactions
}
```

呼び出す側(SwiftUIのView)では:

```swift
Button("取り込む") {
    Task {
        do {
            let transactions = try await extractTransactions(from: pdfData)
            self.transactions = transactions
        } catch {
            print("エラー: \(error)")
        }
    }
}
```

- `async` がついた関数は非同期。呼ぶ側は `await` を付ける
- `Task { }` の中でしか `await` は使えない(SwiftUIのボタンアクションは同期的なクロージャなので、この中でTaskを起動する)

## 7. エラーハンドリング(do/try/catch)

```swift
enum ParsingError: Error {
    case invalidFormat
    case emptyDocument
}

do {
    let transactions = try await extractTransactions(from: pdfData)
} catch ParsingError.invalidFormat {
    print("フォーマットが不正です")
} catch {
    print("その他のエラー: \(error)")
}
```

- `throws` が付いた関数はエラーを投げる可能性がある → 呼ぶ側は `try` を付ける
- `enum` で自分のアプリ独自のエラー種別を定義できる

## 8. Codable(JSON変換) — Claude APIとの連携で必須

```swift
struct ClaudeResponse: Codable {
    let content: [ContentBlock]
}

struct ContentBlock: Codable {
    let type: String
    let text: String?
}
```

`Codable` を付けるだけで、以下のようにJSON文字列 ⇄ Swiftの構造体を自動変換できます。

```swift
let decoded = try JSONDecoder().decode(ClaudeResponse.self, from: jsonData)
let encoded = try JSONEncoder().encode(someStruct)
```

## 9. Keychain(APIキーの安全な保存)

標準ライブラリのKeychain APIは少し煩雑なので、実装時は薄いラッパーを自作するか、`KeychainAccess` のような軽量ライブラリを使うのが一般的です。

```swift
// 概念イメージ(実際はKeychain Services APIを直接叩くか、ラッパーを使う)
KeychainHelper.save(apiKey, forKey: "anthropic_api_key")
let apiKey = KeychainHelper.load(forKey: "anthropic_api_key")
```

ポイントは「`UserDefaults` に平文で保存しない」ことです。APIキーのような秘密情報は必ずKeychain経由で保存します。

## 10. このアプリで実際に組み合わせる形

```
SwiftUIの画面(View)
  → ユーザーがCSV/PDFファイルを選択 or SFSafariViewControllerからShareで受け取る
  → async関数でClaude APIを呼び出し(URLSession + Codable)
  → 返ってきたJSONをTransaction構造体の配列にデコード
  → @Stateまたは@StateObjectで保持し、SwiftUIのListで表示
```

まずは Xcode で「App」テンプレートの新規プロジェクトを作り、`ContentView.swift` を触りながら上記の要素(`@State`、`List`、`Button`、`Task { await ... }`)を実際に動かしてみると理解が早まります。
