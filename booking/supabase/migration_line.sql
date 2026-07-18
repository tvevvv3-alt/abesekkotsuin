-- LINE連携（予約確認・リマインド）
-- Supabase の SQL Editor でこの内容を実行してください。1回だけでOK（再実行しても安全）。

alter table public.appointments add column if not exists line_user_id            text;
alter table public.appointments add column if not exists confirm_sent_at          timestamptz;
alter table public.appointments add column if not exists reminder_eve_sent_at     timestamptz;
alter table public.appointments add column if not exists reminder_morning_sent_at timestamptz;

create index if not exists appointments_line_idx
  on public.appointments (date, status)
  where line_user_id is not null;
