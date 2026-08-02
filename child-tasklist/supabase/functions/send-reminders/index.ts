// pg_cron から一定間隔(post-setup.sql参照、既定10分毎)で呼び出される。
// 目安時刻を過ぎても未チェックの項目を検出し、子端末へリマインドPushを送る。
// 詳細ロジックは docs/design.md 4.1 を参照。
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPush, type PushSubscriptionJSON } from "../_shared/push.ts";

const REMIND_INTERVAL_MS = 30 * 60 * 1000; // 30分
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

Deno.serve(async () => {
  const { date: today, time: nowTime, iso: nowIso } = nowInTokyo();

  const { data: templates, error: templatesError } = await supabase
    .from("task_templates")
    .select("id, family_id, title, time_slot, target_time")
    .eq("active", true);
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

  const toRemind = candidates.filter((t) => {
    const status = statusByTemplate.get(t.id);
    if (status?.checked_at) return false;
    if (status?.last_reminded_at) {
      const elapsed = Date.now() - new Date(status.last_reminded_at).getTime();
      if (elapsed < REMIND_INTERVAL_MS) return false;
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
