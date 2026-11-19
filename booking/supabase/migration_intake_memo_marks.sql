-- カルテ初診時：手書きメモ（自由記入の描き込み）を保存する列。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。
alter table public.patient_intake add column if not exists memo_marks jsonb;

notify pgrst, 'reload schema';
