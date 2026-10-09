-- 自費カルテ（chart_entries）に「次回方針」と「下書き」フラグを追加。
--   next_plan … 次回方針（次回に向けた方針・指導）
--   is_draft  … 下書き保存（true=下書き / false=保存済み）
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.chart_entries add column if not exists next_plan text;
alter table public.chart_entries add column if not exists is_draft boolean not null default false;
