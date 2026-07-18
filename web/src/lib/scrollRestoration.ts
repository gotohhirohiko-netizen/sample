import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const scrollPositions = new Map<string, number>();

function getScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".app-content");
}

/**
 * iOS(WKWebView)はこのスクロール領域の再描画をサボって黒画面/白画面の
 * まま止まることがある(実際にスクロールすると直る既知の挙動)。
 * ユーザーが手で行うのと同じことをコードで行い、1px動かして戻すことで
 * 強制的に再描画させる。位置は直後に戻すため見た目には残らない。
 */
function kickRepaint(el: HTMLElement) {
  const before = el.scrollTop;
  el.scrollTop = before + 1;
  requestAnimationFrame(() => {
    el.scrollTop = before;
  });
}

/**
 * リスト画面から詳細画面へ行って戻ってきた時、タップした項目の位置を
 * 保ったままにする。`.app-content`は画面を跨いで使い回される同一要素だが、
 * 取引詳細のような短い画面を経由するとscrollTopがブラウザ側でリセットされる
 * ため、離脱前の位置を自前で保存・復元する。戻る操作(POP)の時だけ復元し、
 * 通常のリンク遷移(PUSH)では先頭表示のままにする。
 */
export function useScrollRestoration(ready: boolean) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const key = location.pathname;

  useEffect(() => {
    const el = getScrollContainer();
    if (!el) return;
    function onScroll() {
      scrollPositions.set(key, el!.scrollTop);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    const el = getScrollContainer();
    if (!el) return;

    if (navigationType === "POP") {
      const saved = scrollPositions.get(key);
      if (saved != null) {
        el.scrollTop = saved;
      }
    }
    requestAnimationFrame(() => kickRepaint(el));
  }, [key, ready, navigationType]);
}
