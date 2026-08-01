-- 日計表(個別売上)で入力した物販を、物販ページにも表示するためのフラグ。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales add column if not exists retail boolean not null default false;
-- 既存の商品連携(物販ページ)行も物販として扱う
update public.sales set retail = true where product_id is not null and retail = false;
-- 既存の日計表の物販（予約に紐づかない・担当なしの手動行）も物販として扱う
update public.sales set retail = true where appointment_id is null and staff_id is null and retail = false;
