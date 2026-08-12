import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverSrcDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(serverSrcDir, "..", "..");

export const dataDir = path.join(projectRoot, "data");
export const outputDir = path.join(dataDir, "output");
export const tmpDir = path.join(dataDir, "tmp");
export const projectsDir = path.join(dataDir, "projects");
// プロジェクトごとの書き出し作業領域(ダウンロード済み元動画・切り出し済みクリップ)。
// 一時停止・キャンセル(削除しない選択時)のあいだ保持され、サーバー再起動をまたいでも
// 再開できるよう、起動時クリーンアップの対象からは外している。
export const workRootDir = path.join(dataDir, "work");
export const distDir = path.join(projectRoot, "dist");

export const port = Number(process.env.PORT ?? 8787);

// 空き容量がこれを下回ったら書き出し処理を中断する(既定: 3GB)
const minFreeDiskGb = Number(process.env.MIN_FREE_DISK_GB ?? 3);
export const minFreeDiskBytes = minFreeDiskGb * 1024 * 1024 * 1024;

// YouTube側の「ログイン必須」対策で403 Forbiddenになる場合、Cookieを使ってyt-dlpを実行する。
// YTDLP_COOKIES_FILEが設定されていればそちらを優先する(ブラウザのCookie DBがロックされて
// 読めない場合の代替手段。cookies.txtをエクスポートしたファイルを指定する)。
export const ytdlpCookiesFile = process.env.YTDLP_COOKIES_FILE || undefined;
export const ytdlpCookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER || undefined;

// "[download] Got error: N bytes read, M more expected. Giving up after 10 retries" のような
// ダウンロード中の接続切れがWindowsで頻発する場合、IPv6経路の不安定さが原因のことが多い。
// trueにすると--force-ipv4をyt-dlpに渡す。
export const ytdlpForceIpv4 = process.env.YTDLP_FORCE_IPV4 === "true";

export function ensureDataDirs(): void {
  for (const dir of [dataDir, outputDir, tmpDir, projectsDir, workRootDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * サーバー起動時に呼ぶ。data/tmp/ はapply-audio(音楽適用)処理専用の使い捨て一時領域なので、
 * 前回サーバーが異常終了(強制終了・クラッシュ等)して片付けられなかった残骸があっても
 * 起動のたびに空にする。data/work/ (書き出しの一時停止・再開用データ)は意図的に対象外で、
 * 再起動をまたいでも再開できるようにしている。
 */
export function cleanupStaleCaches(): void {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
}
