-- パーソナル回数券：移行前の使用済み回数（既使用）を記録する列。
-- 残 = 回数 − 既使用 − 予約からの自動消費（30分=1・60分=2）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.personal_tickets
  add column if not exists used_offset int not null default 0;
