import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * 外部コマンド(yt-dlp/ffmpeg/ffprobe)を実行し、完了を待つ。
 * 失敗時はexit codeとstderrの末尾を含むエラーを投げる。
 */
export function runCommand(command: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `コマンド起動に失敗しました: ${command} (PATHにインストールされているか確認してください): ${err.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const tail = stderr.trim().split("\n").slice(-20).join("\n");
      reject(new Error(`${command} がコード${code}で終了しました:\n${tail}`));
    });
  });
}
