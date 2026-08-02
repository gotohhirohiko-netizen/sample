/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** vite.config.tsのdefineでビルド時に埋め込まれるアプリのバージョン・ビルド日時 */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_VAPID_PUBLIC_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
