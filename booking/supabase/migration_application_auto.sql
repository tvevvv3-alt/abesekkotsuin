-- 体幹教室 申込書の自動送信ON/OFF。体幹教室を「初めて」予約した人に、
-- LINE連携時に申込書リンクを自動送信する。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings add column if not exists class_application_auto boolean not null default false;
alter table public.appointments add column if not exists application_sent_at timestamptz;
