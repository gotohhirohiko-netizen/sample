import { createReadStream } from "node:fs";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { google } from "googleapis";
import { outputDir } from "../config.ts";
import { buildAuthUrl, exchangeCodeForToken, getAuthenticatedClient, isAuthenticated } from "../lib/youtubeAuth.ts";

export const youtubeRouter = express.Router();

youtubeRouter.get("/status", (_req: Request, res: Response) => {
  res.json({ authenticated: isAuthenticated() });
});

youtubeRouter.get("/auth-url", (_req: Request, res: Response) => {
  try {
    res.json({ url: buildAuthUrl() });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

youtubeRouter.get("/oauth2callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send("認証コードがありません");
    return;
  }
  try {
    await exchangeCodeForToken(code);
    res.send("YouTubeへのログインが完了しました。このタブは閉じて元の画面に戻ってください。");
  } catch (err) {
    res.status(500).send(`認証に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
  }
});

interface UploadRequestBody {
  outputFile?: string;
  title?: string;
  description?: string;
  privacyStatus?: "private" | "unlisted" | "public";
}

youtubeRouter.post("/upload", async (req: Request, res: Response) => {
  const { outputFile, title, description, privacyStatus } = req.body as UploadRequestBody;

  if (!outputFile || !title) {
    res.status(400).json({ error: "outputFileとtitleは必須です" });
    return;
  }

  try {
    const auth = getAuthenticatedClient();
    const youtube = google.youtube({ version: "v3", auth });
    const filePath = path.join(outputDir, path.basename(outputFile));

    const result = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title, description: description ?? "" },
        status: { privacyStatus: privacyStatus ?? "private" },
      },
      media: { body: createReadStream(filePath) },
    });

    res.json({ videoId: result.data.id, url: `https://youtu.be/${result.data.id}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
