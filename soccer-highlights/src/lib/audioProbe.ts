/** ブラウザの<audio>要素を使って、サーバーに送らずmp3ファイルの再生時間を取得する。 */
export function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";

    const cleanup = () => URL.revokeObjectURL(url);

    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error(`音声ファイルを読み込めませんでした: ${file.name}`));
    };

    audio.src = url;
  });
}
