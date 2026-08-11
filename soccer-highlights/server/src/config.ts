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

export function ensureDataDirs(): void {
  for (const dir of [dataDir, downloadsDir, outputDir, tmpDir, projectsDir]) {
    mkdirSync(dir, { recursive: true });
  }
}
