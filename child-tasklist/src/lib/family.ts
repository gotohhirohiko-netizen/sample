import { supabase } from "./supabaseClient";
import type { Member, MemberRole } from "../types/models";

function randomInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0/O/1/I等)を除外
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** 現在の認証ユーザーがどこかの家族に参加済みなら、そのmembers行を返す。 */
export async function fetchOwnMember(authUserId: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 親として新しい家族を作成し、自分をparentとして登録する。 */
export async function createFamily(authUserId: string, displayName: string): Promise<Member> {
  // idを先に採番しておく。families作成直後は自分がまだどの家族のmembersでもないため、
  // RLS上families行を読み返せない(current_family_id()がnull)。読み返しを不要にすることで回避する。
  const familyId = crypto.randomUUID();
  const inviteCode = randomInviteCode();
  const { error: familyError } = await supabase
    .from("families")
    .insert({ id: familyId, invite_code: inviteCode });
  if (familyError) throw familyError;

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      family_id: familyId,
      auth_user_id: authUserId,
      role: "parent" satisfies MemberRole,
      display_name: displayName,
    })
    .select()
    .single();
  if (memberError) throw memberError;
  return member;
}

/** 招待コードで既存の家族にchildとして参加する。 */
export async function joinFamily(
  authUserId: string,
  inviteCode: string,
  displayName: string,
): Promise<Member> {
  const { data: families, error: lookupError } = await supabase.rpc(
    "lookup_family_by_invite_code",
    { p_invite_code: inviteCode.trim().toUpperCase() },
  );
  if (lookupError) throw lookupError;
  const family = families?.[0];
  if (!family) {
    throw new Error("招待コードが見つかりませんでした");
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      family_id: family.id,
      auth_user_id: authUserId,
      role: "child" satisfies MemberRole,
      display_name: displayName,
    })
    .select()
    .single();
  if (memberError) throw memberError;
  return member;
}
