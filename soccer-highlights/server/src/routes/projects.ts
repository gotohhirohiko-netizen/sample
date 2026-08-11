import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { projectsDir } from "../config.ts";
import { sanitizeFileName } from "../lib/sanitize.ts";
import type { Clip, ClipSource } from "../types.ts";

export const projectsRouter = express.Router();

interface PlaylistVideo {
  videoId: string;
  title: string;
}

interface ProjectPlaylist {
  url: string;
  title: string;
  videos: PlaylistVideo[];
}

interface ProjectFile {
  name: string;
  sources: ClipSource[];
  clips: Clip[];
  playlist: ProjectPlaylist | null;
  updatedAt: number;
}

function projectFilePath(sanitizedName: string): string {
  return path.join(projectsDir, `${sanitizedName}.json`);
}

projectsRouter.get("/", async (_req: Request, res: Response) => {
  await mkdir(projectsDir, { recursive: true });
  const entries = await readdir(projectsDir);
  const projects = await Promise.all(
    entries
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const raw = await readFile(path.join(projectsDir, f), "utf-8");
        const data = JSON.parse(raw) as ProjectFile;
        return { name: data.name, updatedAt: data.updatedAt, clipCount: data.clips.length };
      }),
  );
  projects.sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(projects);
});

projectsRouter.get("/:name", async (req: Request<{ name: string }>, res: Response) => {
  const sanitized = sanitizeFileName(req.params.name);
  if (!sanitized) {
    res.status(400).json({ error: "プロジェクト名が不正です" });
    return;
  }
  try {
    const raw = await readFile(projectFilePath(sanitized), "utf-8");
    res.json(JSON.parse(raw) as ProjectFile);
  } catch {
    res.status(404).json({ error: "プロジェクトが見つかりません" });
  }
});

projectsRouter.put("/:name", async (req: Request<{ name: string }>, res: Response) => {
  const sanitized = sanitizeFileName(req.params.name);
  if (!sanitized) {
    res.status(400).json({ error: "プロジェクト名が不正です" });
    return;
  }

  const { sources, clips, playlist } = req.body as {
    sources?: ClipSource[];
    clips?: Clip[];
    playlist?: ProjectPlaylist | null;
  };
  const project: ProjectFile = {
    name: req.params.name,
    sources: sources ?? [],
    clips: clips ?? [],
    playlist: playlist ?? null,
    updatedAt: Date.now(),
  };

  await mkdir(projectsDir, { recursive: true });
  await writeFile(projectFilePath(sanitized), JSON.stringify(project, null, 2), "utf-8");
  res.json(project);
});
