import { statfs } from "node:fs/promises";
import { dataDir, minFreeDiskBytes } from "../config.ts";

export async function getFreeDiskSpaceBytes(): Promise<number> {
  const stats = await statfs(dataDir);
  return stats.bavail * stats.bsize;
}

export function formatBytesAsGb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
}

/** 空き容量がしきい値を下回っていたらエラーを投げる(書き出し処理の各段階で呼ぶ)。 */
export async function assertEnoughDiskSpace(): Promise<void> {
  const free = await getFreeDiskSpaceBytes();
  if (free < minFreeDiskBytes) {
    throw new Error(
      `空き容量が少なくなったため処理を中断しました(空き: ${formatBytesAsGb(free)} / しきい値: ${formatBytesAsGb(minFreeDiskBytes)})`,
    );
  }
}
