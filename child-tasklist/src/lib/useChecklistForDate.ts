import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { errorMessage } from "./errorMessage";
import type { DailyTaskStatus, TaskTemplate } from "../types/models";

export interface ChecklistEntry {
  template: TaskTemplate;
  status: DailyTaskStatus | null;
}

/** 家族の指定日のチェックリスト(テンプレート+チェック状態)をRealtime購読付きで取得する */
export function useChecklistForDate(familyId: string | null, date: string) {
  const [entries, setEntries] = useState<ChecklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const { data: templates, error: templatesError } = await supabase
        .from("task_templates")
        .select("*")
        .eq("family_id", familyId)
        .eq("active", true)
        .order("time_slot")
        .order("target_time")
        .order("display_order");
      if (templatesError) throw templatesError;

      const templateIds = (templates ?? []).map((t) => t.id);
      let statuses: DailyTaskStatus[] = [];
      if (templateIds.length > 0) {
        const { data, error: statusError } = await supabase
          .from("daily_task_status")
          .select("*")
          .eq("date", date)
          .in("template_id", templateIds);
        if (statusError) throw statusError;
        statuses = data ?? [];
      }
      const statusByTemplate = new Map(statuses.map((s) => [s.template_id, s]));
      setEntries(
        (templates ?? []).map((template) => ({
          template,
          status: statusByTemplate.get(template.id) ?? null,
        })),
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [familyId, date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!familyId) return;
    const channel = supabase
      .channel(`checklist-${familyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_templates", filter: `family_id=eq.${familyId}` },
        () => load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_task_status" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyId, load]);

  const toggleCheck = useCallback(
    async (templateId: string, memberId: string, checked: boolean) => {
      const { error: upsertError } = await supabase.from("daily_task_status").upsert(
        {
          template_id: templateId,
          date,
          checked_at: checked ? new Date().toISOString() : null,
          checked_by: checked ? memberId : null,
        },
        { onConflict: "template_id,date" },
      );
      if (upsertError) throw upsertError;
      await load();
    },
    [date, load],
  );

  return { entries, loading, error, reload: load, toggleCheck };
}
