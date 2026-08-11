import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// このアプリはGitHub Pagesにはデプロイしない(ローカル実行専用)。
// `npm run dev` 時はローカルのExpressサーバー(既定: http://localhost:8787)に
// /api を委譲し、yt-dlp/ffmpegによる動画処理を行わせる。
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
});
