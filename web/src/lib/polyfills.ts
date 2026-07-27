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

/**
 * SafariがReadableStreamの非同期反復(`for await...of`)に対応したのは
 * Safari 26.4からで、それより前のバージョンでは
 * `ReadableStream.prototype[Symbol.asyncIterator]`が存在しない。
 * pdf.jsの`getTextContent()`はこれを前提に`for await (const value of stream)`を
 * 直接使っているため、無いと「undefined is not a function」で失敗する。
 */
if (
  typeof ReadableStream !== "undefined" &&
  typeof (ReadableStream.prototype as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] !==
    "function"
) {
  (ReadableStream.prototype as unknown as Record<typeof Symbol.asyncIterator, () => AsyncIterator<unknown>>)[
    Symbol.asyncIterator
  ] = function (this: ReadableStream) {
    const reader = this.getReader();
    return {
      async next() {
        const { done, value } = await reader.read();
        return { done: !!done, value };
      },
      async return(value?: unknown) {
        reader.releaseLock();
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
}
