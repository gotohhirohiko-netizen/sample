-- 0001_init.sql の適用・Edge Functionsのデプロイ・VAPIDシークレット設定が
-- すべて終わった後、SQL Editorで実行する(README.md参照)。
--
-- 以下の <placeholder> をプロジェクトの実際の値に置き換えてから実行すること。
--   <PROJECT_REF>  : SupabaseプロジェクトのURLの xxxx 部分(https://xxxx.supabase.co)
--   <ANON_KEY>      : Settings > API の anon public key
--
-- pg_cron / pg_net 拡張は Database > Extensions から有効化しておくこと(無料プランで利用可)。

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 1. リマインド送信を10分毎に実行する(send-reminders Edge Functionを呼び出す)
select cron.schedule(
  'send-reminders-every-10-min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 2. daily_task_status が更新されたら即座に notify-check Edge Function を呼び出す
--    (子がチェックした瞬間に親へ通知するため)
create or replace function notify_check_webhook() returns trigger
language plpgsql as $$
begin
  perform net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
    )
  );
  return new;
end;
$$;

drop trigger if exists daily_task_status_notify_check on daily_task_status;
create trigger daily_task_status_notify_check
after insert or update on daily_task_status
for each row
execute function notify_check_webhook();

-- 動作確認: pg_cronのジョブ一覧
-- select * from cron.job;
-- 直近の実行結果
-- select * from cron.job_run_details order by start_time desc limit 5;
