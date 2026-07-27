/**
 * Safari 17.3以前(iOS 17.4未満)には`Promise.withResolvers`が実装されておらず、
 * これを内部で使うpdf.js(PayPayカード・楽天カードのPDF解析)が
 * "undefined is not a function"で失敗する。MDN標準のポリフィルで補う。
 * main.tsxの先頭、他の何よりも先にimportすること。
 */
if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
