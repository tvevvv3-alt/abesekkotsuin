-- 物販/予約外の行を「どの予約(購入者)の下に置くか」を指定する列。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales add column if not exists anchor_appointment_id uuid;
