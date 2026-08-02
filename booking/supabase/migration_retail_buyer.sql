-- 物販の「購入者名」を保存する列。商品名は既存の patient_name を使う。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales add column if not exists retail_buyer text;
