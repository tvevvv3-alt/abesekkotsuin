-- 問診票の「確認済み」管理用。来院確認したら印をつける（削除せず蓄積）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.patient_intake add column if not exists reviewed_at timestamptz;
