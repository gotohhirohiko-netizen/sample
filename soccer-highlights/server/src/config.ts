import { mkdirSync } from "node:fs";
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

export function ensureDataDirs(): void {
  for (const dir of [dataDir, downloadsDir, outputDir, tmpDir, projectsDir]) {
    mkdirSync(dir, { recursive: true });
  }
}
