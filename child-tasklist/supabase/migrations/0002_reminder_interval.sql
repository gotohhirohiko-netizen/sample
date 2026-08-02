-- リマインドの繰り返し間隔を家族ごとに設定できるようにする(既定30分)

alter table families
  add column reminder_interval_minutes integer not null default 30
  check (reminder_interval_minutes >= 5 and reminder_interval_minutes <= 180);

create policy families_update on families for update
  using (id = current_family_id() and is_parent())
  with check (id = current_family_id() and is_parent());
