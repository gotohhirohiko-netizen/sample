import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
}

export class CancelledError extends Error {
  constructor() {
    super("キャンセルされました");
    this.name = "CancelledError";
  }
}

/**
 * 外部コマンド(yt-dlp/ffmpeg/ffprobe)を実行し、完了を待つ。
 * 失敗時はexit codeとstderrの末尾を含むエラーを投げる。
 * signalが渡され、実行中にabortされた場合はプロセスを強制終了しCancelledErrorを投げる。
 */
export function runCommand(command: string, args: string[], signal?: AbortSignal): Promise<RunResult> {
  if (signal?.aborted) return Promise.reject(new CancelledError());

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal,
      // yt-dlp(Python製)はWindowsでは既定でコンソールのコードページ(日本語環境だとcp932)で
      // 標準出力に書き出すことがあり、UTF-8として読み取るこちら側で動画タイトル等の日本語が
      // 文字化けする原因になっていた。PYTHONUTF8/PYTHONIOENCODINGでUTF-8出力を強制する。
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (signal?.aborted) {
        reject(new CancelledError());
        return;
      }
      reject(
        new Error(
          `コマンド起動に失敗しました: ${command} (PATHにインストールされているか確認してください): ${err.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (signal?.aborted) {
        reject(new CancelledError());
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const tail = stderr.trim().split("\n").slice(-20).join("\n");
      reject(new Error(`${command} がコード${code}で終了しました:\n${tail}`));
    });
  });
}
