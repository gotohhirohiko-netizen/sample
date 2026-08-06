export type TimeSlot = "morning" | "noon" | "evening";
export type MemberRole = "parent" | "child";

export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "朝",
  noon: "昼",
  evening: "晩",
};

export const TIME_SLOT_ORDER: TimeSlot[] = ["morning", "noon", "evening"];

export interface Family {
  id: string;
  name: string;
  invite_code: string;
  reminder_interval_minutes: number;
  created_at: string;
}

export interface Member {
  id: string;
  family_id: string;
  auth_user_id: string;
  role: MemberRole;
  display_name: string;
  push_subscription: PushSubscriptionJSON | null;
  created_at: string;
}

export interface TaskList {
  id: string;
  family_id: string;
  name: string;
  is_default: boolean;
  start_date: string | null; // "YYYY-MM-DD"(通常リストはnull)
  end_date: string | null; // "YYYY-MM-DD"(通常リストはnull)
  created_at: string;
}

export interface TaskTemplate {
  id: string;
  family_id: string;
  list_id: string;
  title: string;
  time_slot: TimeSlot;
  target_time: string; // "HH:mm:ss"
  display_order: number;
  active: boolean;
  created_at: string;
}

export interface DailyTaskStatus {
  id: string;
  template_id: string;
  date: string; // "YYYY-MM-DD"
  checked_at: string | null;
  checked_by: string | null;
  last_reminded_at: string | null;
  reminder_count: number;
}
