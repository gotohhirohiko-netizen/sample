import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverSrcDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(serverSrcDir, "..", "..");

export const dataDir = path.join(projectRoot, "data");
export const downloadsDir = path.join(dataDir, "downloads");
export const outputDir = path.join(dataDir, "output");
export const tmpDir = path.join(dataDir, "tmp");
export const projectsDir = path.join(dataDir, "projects");
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

export function ensureDataDirs(): void {
  for (const dir of [dataDir, downloadsDir, outputDir, tmpDir, projectsDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * サーバー起動時に呼ぶ。前回サーバーが異常終了(強制終了・クラッシュ等)した場合、
 * 書き出しジョブが後片付けできずにdata/downloads・data/tmpへ残骸が残ることがあるため、
 * 起動のたびに空にする(どちらも純粋なキャッシュ/作業領域で、必要なら自動的に作り直される)。
 */
export function cleanupStaleCaches(): void {
  rmSync(downloadsDir, { recursive: true, force: true });
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(downloadsDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
}
