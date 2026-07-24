-- 院全体の月間売上目標（円）。個別売上のサマリーで達成率を表示。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings add column if not exists clinic_sales_target int not null default 0;
