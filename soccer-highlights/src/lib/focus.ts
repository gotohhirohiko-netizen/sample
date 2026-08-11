import type { MouseEvent } from "react";

/**
 * ボタンクリックでフォーカスが移動しないようにする。
 * mousedownの既定動作(フォーカス移動)を止めることで、直前まで動画側にあった
 * フォーカスを維持し、矢印キーによる早送り/巻き戻しを妨げないようにする。
 */
export function preventFocusSteal(e: MouseEvent<HTMLButtonElement>) {
  e.preventDefault();
}
