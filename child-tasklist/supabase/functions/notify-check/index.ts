// daily_task_status への Database Webhook(INSERT/UPDATE)から呼び出される。
// 子がチェックした瞬間、その家族の親端末へ完了Pushを送る。docs/design.md 4.2 参照。
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPush, type PushSubscriptionJSON } from "../_shared/push.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  record: {
    template_id: string;
    checked_at: string | null;
    checked_by: string | null;
  };
  old_record: { checked_at: string | null } | null;
}

Deno.serve(async (req) => {
  const payload = (await req.json()) as WebhookPayload;
  const { record, old_record } = payload;

  // 未チェック→チェック済みへの変化のときだけ通知する(チェック解除時や無関係な更新では送らない)
  const newlyChecked = record.checked_at !== null && (old_record?.checked_at ?? null) === null;
  if (!newlyChecked) {
    return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
  }

  const { data: template } = await supabase
    .from("task_templates")
    .select("title, family_id")
    .eq("id", record.template_id)
    .single();
  if (!template) {
    return new Response(JSON.stringify({ notified: 0 }), { status: 200 });
  }

  const { data: checker } = record.checked_by
    ? await supabase.from("members").select("display_name").eq("id", record.checked_by).single()
    : { data: null };

  const { data: parents } = await supabase
    .from("members")
    .select("id, push_subscription")
    .eq("family_id", template.family_id)
    .eq("role", "parent")
    .not("push_subscription", "is", null);

  const who = checker?.display_name?.trim() || "お子さん";
  let notified = 0;
  for (const parent of parents ?? []) {
    const subscription = parent.push_subscription as PushSubscriptionJSON | null;
    if (!subscription) continue;
    const result = await sendPush(subscription, {
      title: "タスク完了",
      body: `${who}が「${template.title}」を完了しました`,
    });
    if (result.expired) {
      await supabase.from("members").update({ push_subscription: null }).eq("id", parent.id);
    }
    if (result.ok) notified += 1;
  }

  return new Response(JSON.stringify({ notified }), { status: 200 });
});
