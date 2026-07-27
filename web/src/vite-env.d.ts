/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** vite.config.tsのdefineでビルド時に埋め込まれるアプリのバージョン・ビルド日時 */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
