import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/** 端末ごとの匿名認証。未ログインなら匿名ユーザーを作成し、既存セッションがあればそれを使う。 */
export async function ensureAuthenticated(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error || !signInData.session) {
    throw new Error(`匿名認証に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return signInData.session.user.id;
}
