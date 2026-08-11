import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { dataDir, port } from "../config.ts";

const tokenPath = path.join(dataDir, "youtube-token.json");

function getOAuthClient(): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `http://localhost:${port}/api/youtube/oauth2callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です。README の「YouTubeアップロード設定」を参照してください。",
    );
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  if (existsSync(tokenPath)) {
    client.setCredentials(JSON.parse(readFileSync(tokenPath, "utf-8")));
  }
  return client;
}

export function isAuthenticated(): boolean {
  return existsSync(tokenPath);
}

export function buildAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/youtube.upload"],
  });
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), "utf-8");
}

export function getAuthenticatedClient(): InstanceType<typeof google.auth.OAuth2> {
  if (!existsSync(tokenPath)) {
    throw new Error("YouTubeにログインしていません。先に「YouTubeにログイン」を行ってください。");
  }
  return getOAuthClient();
}
