-- 個別売上の行の並び順（手動で上下入れ替え可能に）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales add column if not exists sort_order double precision;
