-- 子ども遠征タスクリストアプリ 初期スキーマ
-- 詳細はdocs/design.md 2章・3章を参照

create extension if not exists "pgcrypto";

-- 家族(招待コードで親子を紐付ける単位)
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我が家',
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- 家族に属する端末(匿名認証のユーザーと1:1)
create table members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'child')),
  display_name text not null default '',
  push_subscription jsonb,
  created_at timestamptz not null default now()
);

-- チェックリスト項目のテンプレート(親が設定。毎日同じ内容を使い回す)
create table task_templates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  time_slot text not null check (time_slot in ('morning', 'noon', 'evening')),
  target_time time not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 日毎のチェック状態・リマインド送信状況(テンプレート×日付で一意)
create table daily_task_status (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates(id) on delete cascade,
  date date not null,
  checked_at timestamptz,
  checked_by uuid references members(id),
  last_reminded_at timestamptz,
  reminder_count integer not null default 0,
  unique (template_id, date)
);

create index on members (family_id);
create index on task_templates (family_id);
create index on daily_task_status (template_id, date);

-- RLSヘルパー関数(security definerでmembersテーブルへのRLS再帰参照を避ける)
create function current_family_id() returns uuid
language sql security definer stable as $$
  select family_id from members where auth_user_id = auth.uid() limit 1;
$$;

create function is_parent() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from members where auth_user_id = auth.uid() and role = 'parent'
  );
$$;

alter table families enable row level security;
alter table members enable row level security;
alter table task_templates enable row level security;
alter table daily_task_status enable row level security;

-- families: 自分の家族のみ参照可能(他家族のinvite_code等を一覧できないようにする)。作成は認証済みなら可能。更新は不可。
create policy families_select on families for select
  using (id = current_family_id());
create policy families_insert on families for insert
  with check (auth.uid() is not null);

-- 招待コードでの家族参加用。families全体へのSELECT権限を与えずに、
-- コードが一致した1件のid/nameだけを返す(security definerでRLSをバイパス)。
create function lookup_family_by_invite_code(p_invite_code text)
returns table (id uuid, name text)
language sql security definer stable as $$
  select id, name from families where invite_code = p_invite_code;
$$;

-- members: 自分自身、または同じ家族のメンバーを参照可能。自己登録・自己更新のみ許可。
create policy members_select on members for select
  using (auth_user_id = auth.uid() or family_id = current_family_id());
create policy members_insert on members for insert
  with check (auth_user_id = auth.uid());
create policy members_update on members for update
  using (auth_user_id = auth.uid());

-- task_templates: 同じ家族のみ参照可能。作成・更新・削除は親ロールのみ。
create policy task_templates_select on task_templates for select
  using (family_id = current_family_id());
create policy task_templates_insert on task_templates for insert
  with check (family_id = current_family_id() and is_parent());
create policy task_templates_update on task_templates for update
  using (family_id = current_family_id() and is_parent());
create policy task_templates_delete on task_templates for delete
  using (family_id = current_family_id() and is_parent());

-- daily_task_status: 紐づくtask_templatesの家族に属していれば参照・チェック可能(親・子とも)
create policy daily_task_status_select on daily_task_status for select
  using (
    exists (
      select 1 from task_templates t
      where t.id = daily_task_status.template_id
      and t.family_id = current_family_id()
    )
  );
create policy daily_task_status_insert on daily_task_status for insert
  with check (
    exists (
      select 1 from task_templates t
      where t.id = daily_task_status.template_id
      and t.family_id = current_family_id()
    )
  );
create policy daily_task_status_update on daily_task_status for update
  using (
    exists (
      select 1 from task_templates t
      where t.id = daily_task_status.template_id
      and t.family_id = current_family_id()
    )
  );

-- Realtime購読(親の「今日の進捗」画面のリアルタイム更新用)
alter publication supabase_realtime add table task_templates;
alter publication supabase_realtime add table daily_task_status;
