-- 期間指定の「特別なタスクリスト」を複数作成できるようにする。
-- 各家族には常に1つの「通常のタスクリスト」(is_default = true, 期間指定なし)があり、
-- 特別リストの期間(start_date〜end_date)に該当しない日はこの通常リストが使われる。

create table task_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  check (
    (is_default and start_date is null and end_date is null)
    or (not is_default and start_date is not null and end_date is not null and end_date >= start_date)
  )
);

create index on task_lists (family_id);

-- 家族ごとに通常リストは常に1つだけ(2つ目のis_default=trueを作れないようにする)
create unique index task_lists_one_default_per_family on task_lists (family_id) where is_default;

alter table task_lists enable row level security;

-- is_defaultをtrueにできるのはtask_lists_one_default_per_family(ユニークインデックス)により
-- 家族ごとに常に高々1件までに制限される。家族作成直後、そのクライアント自身が通常リストを
-- 作成する必要があるため、insertではis_defaultを特別扱いしない。
create policy task_lists_select on task_lists for select
  using (family_id = current_family_id());
create policy task_lists_insert on task_lists for insert
  with check (family_id = current_family_id() and is_parent());
create policy task_lists_update on task_lists for update
  using (family_id = current_family_id() and is_parent());
create policy task_lists_delete on task_lists for delete
  using (family_id = current_family_id() and is_parent() and not is_default);

alter publication supabase_realtime add table task_lists;

-- task_templates をリストに紐づける
alter table task_templates add column list_id uuid references task_lists(id) on delete cascade;

-- 既存の各家族に通常リストを作成し、既存のtask_templatesをそこに割り当てる
insert into task_lists (family_id, name, is_default)
select id, '通常のタスクリスト', true from families;

update task_templates t
set list_id = l.id
from task_lists l
where l.family_id = t.family_id and l.is_default = true;

alter table task_templates alter column list_id set not null;

create index on task_templates (list_id);
