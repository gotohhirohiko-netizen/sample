import express, { type Request, type Response } from "express";
import { resolveVideoMetadata } from "../lib/ytdlp.ts";

export const sourcesRouter = express.Router();

sourcesRouter.post("/resolve", async (req: Request, res: Response) => {
  const youtubeUrl = req.body?.youtubeUrl as string | undefined;
  if (!youtubeUrl) {
    res.status(400).json({ error: "youtubeUrlは必須です" });
    return;
  }

  try {
    const metadata = await resolveVideoMetadata(youtubeUrl);
    res.json(metadata);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
