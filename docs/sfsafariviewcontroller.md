# SFSafariViewController まとめ

三菱UFJ銀行・楽天カード・PayPayカードの明細ページにログイン・アクセスするために使う画面の仕組みです。

## これは何か

`SFSafariViewController` は、Appleが提供する「アプリ内で開ける、本物のSafari」です。自分でWebViewを実装する(`WKWebView`)のではなく、iOS標準のSafariエンジンをそのままモーダルシートとして表示します。

- SafariExtensions(SFSafariServices)フレームワークに含まれる、`UIKit` のクラス
- SwiftUIのネイティブ機能ではないため、SwiftUIから使うには橋渡し(ラッパー)が必要

## なぜこれを選んだか(前回の議論のおさらい)

| 方式 | 特徴 |
|---|---|
| 自作`WKWebView` | ダウンロードを自動捕捉できるが、UA偽装が必要になったり、サイト側にbot判定されるリスクがある |
| 外部Safari(完全に離脱) | 最も簡単・堅牢だが、アプリを完全に離れてしまう |
| **`SFSafariViewController`** | 本物のSafariなのでUA偽装不要・サイト側にブロックされにくい。かつモーダルシートなのでアプリ内に留まる感覚が保てる |

ダウンロードの自動捕捉は諦め、ダウンロード後にユーザーが手動でアプリに共有(Share)する、という設計にしたのがポイントです。

## 基本的な使い方

`SFSafariViewController` はUIKitのクラスなので、SwiftUIで使うには `UIViewControllerRepresentable` で包む必要があります。

```swift
import SwiftUI
import SafariServices

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let config = SFSafariViewController.Configuration()
        config.entersReaderIfAvailable = false
        return SFSafariViewController(url: url, configuration: config)
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {
        // 更新の必要が無ければ空でよい
    }
}
```

SwiftUI側からは `.sheet` で呼び出します。

```swift
struct ImportView: View {
    @State private var showSafari = false

    // 各サービスの明細ページへの直リンク(ディープリンク)
    let rakutenStatementURL = URL(string: "https://www.rakuten-card.co.jp/e-navi/members/statement/index.xhtml")!

    var body: some View {
        Button("楽天カードの明細を開く") {
            showSafari = true
        }
        .sheet(isPresented: $showSafari) {
            SafariView(url: rakutenStatementURL)
        }
    }
}
```

これで、ボタンを押すとアプリ内にSafariのシートが立ち上がり、その中でログイン→明細ページ→CSVダウンロード、という一連の操作をユーザーが手動で行えます。

## 完了(閉じた)タイミングを検知したい場合

`SFSafariViewControllerDelegate` を使うと、ユーザーがシートを閉じたタイミングを検知できます(「ダウンロードが終わったら閉じてください」という導線を作る際に使う)。

```swift
final class SafariCoordinator: NSObject, SFSafariViewControllerDelegate {
    func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        // シートが閉じられた = ユーザーの操作が一段落したと判断できる
        // ここで「ダウンロードフォルダを確認してください」といった案内を出す、など
    }
}
```

`UIViewControllerRepresentable` の `makeCoordinator()` を使ってこのDelegateを結びつけます。

## Cookie・セッションの共有について

`SFSafariViewController` は端末のSafariと**Cookie・保存済みパスワードを共有**します。これは自作WebViewには無いメリットです。

- すでにSafariでログイン済みのサイトなら、`SFSafariViewController` を開いた瞬間から既にログイン状態になっていることがある
- iCloud キーチェーンに保存されたパスワードのオートフィルが使える
- 銀行の2段階認証(SMSやアプリ通知)も、通常のSafariと同じ挙動になるため、埋め込みWebViewで起きがちな「認証が通らない」問題を回避しやすい

## できないこと(制約)

- **JavaScriptの注入・実行はできない** — ページ内のボタンをコードから自動でクリックする、といったことは不可能(これは意図した制約で、自動化リスクを避けるための設計でもあります)
- **ページ内の遷移をコードから検知・介入することは基本的にできない** — 「今どのURLを見ているか」を細かく取得するAPIは提供されていない
- **ダウンロードの自動捕捉はできない** — CSV/PDFがダウンロードされると、通常のSafariと同様に「ファイル」アプリの `ダウンロード` フォルダなどに保存される。アプリ側は自動では気づけない

## ダウンロードしたファイルの取り込み方(この制約への対応)

自動捕捉ができない前提で、次のいずれかの方法でアプリに取り込みます。

1. **Share Sheet経由**(シンプルで確実): ダウンロード完了後、「ファイル」アプリまたはSafariのダウンロード通知から共有シートを開き、自作アプリを選択して渡す。アプリ側は `Share Extension` を実装してこれを受け取る
2. **手動インポート画面**: アプリ内に「ファイルを選択」ボタンを用意し、`UIDocumentPickerViewController`(iOSの標準ファイル選択画面)経由でユーザーが「ダウンロード」フォルダから該当ファイルを選ぶ

最初はシンプルな2の「手動インポート画面」から実装し、慣れてきたら1のShare Extensionを追加する、という順番がおすすめです。

## まとめ図

```
[アプリ] --.sheet--> [SFSafariViewController(本物のSafari)]
   ログイン・明細ページ遷移・CSVダウンロードはすべて手動操作
                    ↓ (シートを閉じる)
[アプリ] <--UIDocumentPicker or Share Extension-- [ダウンロードされたファイル]
   ↓
Claude APIで解析 → 家計簿データとして保存
```
