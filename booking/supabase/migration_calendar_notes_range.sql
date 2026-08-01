-- カレンダーメモの複数日対応（終了日）。終日メモを期間で入れられるようにする。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.calendar_notes add column if not exists end_date date;
