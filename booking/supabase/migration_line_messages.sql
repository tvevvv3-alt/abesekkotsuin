-- LINE メッセージ設定（管理画面から文面・時間を編集できるように）
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings add column if not exists confirm_text          text;
alter table public.settings add column if not exists remind_eve_enabled     boolean not null default true;
alter table public.settings add column if not exists remind_eve_hour        int not null default 18;
alter table public.settings add column if not exists remind_eve_text        text;
alter table public.settings add column if not exists remind_morning_enabled boolean not null default true;
alter table public.settings add column if not exists remind_morning_hour    int not null default 9;
alter table public.settings add column if not exists remind_morning_text    text;
