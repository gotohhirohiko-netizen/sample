import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version: string;
};

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  build: {
    sourcemap: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        // node_modulesの巨大な依存(supabase-js等)をprecacheに含めるとビルドが重くなるため、
        // アプリ本体のJS/CSSのみを対象にする
        globPatterns: ["**/*.{js,css,html,svg,png}"],
      },
      injectRegister: "auto",
      manifest: {
        name: "遠征タスクリスト",
        short_name: "タスクリスト",
        description: "子どもの遠征中のやることチェックリスト",
        start_url: "./",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#2f9e6f",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
