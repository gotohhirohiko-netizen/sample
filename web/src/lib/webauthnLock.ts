import { db } from "./db";

/**
 * Face ID/Touch ID(WebAuthn プラットフォーム認証)によるアプリロック。
 * バックエンドが無いため、サーバー側での署名検証は行わない —
 * navigator.credentials.get()がuserVerification: "required"付きで
 * 正常に解決すること自体が、その場でOSレベルの生体認証を通過した証拠になる。
 *
 * 重要な注意: 復旧手段が無い。Face ID/Touch IDが使えなくなる
 * (機種変更、認証情報のリセット等)と、ロックを解除する方法は
 * ブラウザのサイトデータを消去する(=アプリの全データも消える)しかない。
 * ロック設定前に必ずバックアップを取ることを強く推奨する。
 */

const CREDENTIAL_ID_SETTING = "webauthnCredentialId";

export function isWebAuthnSupported(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

export async function isLockEnabled(): Promise<boolean> {
  const entry = await db.settings.get(CREDENTIAL_ID_SETTING);
  return !!entry;
}

/** Face ID/Touch IDでの認証情報を新規登録し、ロックを有効化する */
export async function registerLock(): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "家計簿" },
      user: {
        id: userId,
        name: "kakeibo-user",
        displayName: "家計簿",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("生体認証の登録に失敗しました");

  await db.settings.put({ key: CREDENTIAL_ID_SETTING, value: credential.id });
}

/** ロックを解除(無効化)する */
export async function removeLock(): Promise<void> {
  await db.settings.delete(CREDENTIAL_ID_SETTING);
}

/** ロックが有効な場合、Face ID/Touch IDでの認証を要求する。無効なら常にtrue */
export async function unlockWithBiometrics(): Promise<boolean> {
  const entry = await db.settings.get(CREDENTIAL_ID_SETTING);
  if (!entry) return true;

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: fromBase64Url(entry.value), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
