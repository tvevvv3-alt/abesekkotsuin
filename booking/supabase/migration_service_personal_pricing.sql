-- パーソナルメニューの料金・有効期限（初診/再診ではなく、1回あたり／10回分）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.services
  add column if not exists personal_unit_price int,      -- 1回あたりの料金
  add column if not exists personal_pack_price int,      -- 10回分（回数券）の料金
  add column if not exists personal_valid_months int default 5; -- 有効期限（月）
