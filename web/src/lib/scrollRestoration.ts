import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const scrollPositions = new Map<string, number>();

function getScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".app-content");
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
    if (!ready || navigationType !== "POP") return;
    const el = getScrollContainer();
    const saved = scrollPositions.get(key);
    if (el && saved != null) {
      el.scrollTop = saved;
    }
  }, [key, ready, navigationType]);
}
