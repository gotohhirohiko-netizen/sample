// Safari 17.3以前(iOS 17.4未満)にはPromise.withResolvers()が実装されておらず、
// これを使うpdf.worker.min.mjs(このWorkerの実体)が失敗する。
// このWorkerはメインスレッドとは別のグローバルスコープを持つため、
// main.tsx側のポリフィルはここには効かない。top-level awaitで本体を
// 読み込む前に必ずポリフィルを適用する(先に本体を読み込むと、その中の
// メッセージハンドラ登録が完了する前にメインスレッドからのメッセージが
// 届いて取りこぼされる可能性があるため)。
if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
await import("./pdf.worker.min.mjs");
