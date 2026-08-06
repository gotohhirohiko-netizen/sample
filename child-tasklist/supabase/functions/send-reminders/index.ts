// pg_cron から一定間隔(post-setup.sql参照、既定5分毎)で呼び出される。
// 目安時刻を過ぎても未チェックの項目を検出し、子端末へリマインドPushを送る。
// 詳細ロジックは docs/design.md 4.1 を参照。
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPush, type PushSubscriptionJSON } from "../_shared/push.ts";

const DEFAULT_REMIND_INTERVAL_MINUTES = 30;
const SLOT_CUTOFF: Record<string, string> = {
  morning: "12:00:00",
  noon: "18:00:00",
  evening: "23:00:00",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function nowInTokyo(): { date: string; time: string; iso: string } {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  return { date, time, iso: now.toISOString() };
}

interface TaskListRow {
  id: string;
  family_id: string;
  is_default: boolean;
  start_date: string | null;
  end_date: string | null;
}

/** 家族ごとに「今日」有効なタスクリストを決める(特別リストの期間内ならそれ、無ければ通常リスト)。 */
function resolveActiveListIdsByFamily(lists: TaskListRow[], today: string): Map<string, string> {
  const listsByFamily = new Map<string, TaskListRow[]>();
  for (const l of lists) {
    const arr = listsByFamily.get(l.family_id) ?? [];
    arr.push(l);
    listsByFamily.set(l.family_id, arr);
  }
  const activeListIdByFamily = new Map<string, string>();
  for (const [familyId, familyLists] of listsByFamily) {
    const special = familyLists.find(
      (l) => !l.is_default && l.start_date && l.end_date && l.start_date <= today && today <= l.end_date,
    );
    const active = special ?? familyLists.find((l) => l.is_default);
    if (active) activeListIdByFamily.set(familyId, active.id);
  }
  return activeListIdByFamily;
}

Deno.serve(async () => {
  const { date: today, time: nowTime, iso: nowIso } = nowInTokyo();

  const { data: lists, error: listsError } = await supabase
    .from("task_lists")
    .select("id, family_id, is_default, start_date, end_date");
  if (listsError) {
    console.error(listsError);
    return new Response(JSON.stringify({ error: listsError.message }), { status: 500 });
  }
  const activeListIds = [...resolveActiveListIdsByFamily(lists ?? [], today).values()];
  if (activeListIds.length === 0) {
    return new Response(JSON.stringify({ reminded: 0 }), { status: 200 });
  }

  const { data: templates, error: templatesError } = await supabase
    .from("task_templates")
    .select("id, family_id, title, time_slot, target_time")
    .eq("active", true)
    .in("list_id", activeListIds);
  if (templatesError) {
    console.error(templatesError);
    return new Response(JSON.stringify({ error: templatesError.message }), { status: 500 });
  }

  const candidates = (templates ?? []).filter((t) => {
    const cutoff = SLOT_CUTOFF[t.time_slot] ?? "23:59:59";
    return t.target_time <= nowTime && nowTime <= cutoff;
  });
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ reminded: 0 }), { status: 200 });
  }

  const templateIds = candidates.map((t) => t.id);
  const { data: statuses } = await supabase
    .from("daily_task_status")
    .select("template_id, checked_at, last_reminded_at, reminder_count")
    .eq("date", today)
    .in("template_id", templateIds);
  const statusByTemplate = new Map((statuses ?? []).map((s) => [s.template_id, s]));

  const candidateFamilyIds = [...new Set(candidates.map((t) => t.family_id))];
  const { data: families } = await supabase
    .from("families")
    .select("id, reminder_interval_minutes")
    .in("id", candidateFamilyIds);
  const remindIntervalMsByFamily = new Map(
    (families ?? []).map((f) => [
      f.id,
      (f.reminder_interval_minutes ?? DEFAULT_REMIND_INTERVAL_MINUTES) * 60 * 1000,
    ]),
  );

  const toRemind = candidates.filter((t) => {
    const status = statusByTemplate.get(t.id);
    if (status?.checked_at) return false;
    if (status?.last_reminded_at) {
      const intervalMs =
        remindIntervalMsByFamily.get(t.family_id) ?? DEFAULT_REMIND_INTERVAL_MINUTES * 60 * 1000;
      const elapsed = Date.now() - new Date(status.last_reminded_at).getTime();
      if (elapsed < intervalMs) return false;
    }
    return true;
  });
  if (toRemind.length === 0) {
    return new Response(JSON.stringify({ reminded: 0 }), { status: 200 });
  }

  const familyIds = [...new Set(toRemind.map((t) => t.family_id))];
  const { data: childMembers } = await supabase
    .from("members")
    .select("id, family_id, push_subscription")
    .eq("role", "child")
    .in("family_id", familyIds)
    .not("push_subscription", "is", null);

  const childrenByFamily = new Map<string, typeof childMembers>();
  for (const m of childMembers ?? []) {
    const list = childrenByFamily.get(m.family_id) ?? [];
    list.push(m);
    childrenByFamily.set(m.family_id, list);
  }

  let reminded = 0;
  for (const template of toRemind) {
    const children = childrenByFamily.get(template.family_id) ?? [];
    for (const child of children) {
      const subscription = child.push_subscription as PushSubscriptionJSON | null;
      if (!subscription) continue;
      const result = await sendPush(subscription, {
        title: "タスクリマインド",
        body: `「${template.title}」がまだチェックされていません`,
      });
      if (result.expired) {
        await supabase.from("members").update({ push_subscription: null }).eq("id", child.id);
      }
    }

    const status = statusByTemplate.get(template.id);
    await supabase.from("daily_task_status").upsert(
      {
        template_id: template.id,
        date: today,
        last_reminded_at: nowIso,
        reminder_count: (status?.reminder_count ?? 0) + 1,
      },
      { onConflict: "template_id,date" },
    );
    reminded += 1;
  }

  return new Response(JSON.stringify({ reminded }), { status: 200 });
});
