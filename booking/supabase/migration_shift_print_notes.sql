-- シフト印刷（診療日カレンダー）下部の自由文メモ。月ごとに1件。
-- 例：「5日(水)〜9日(日) 澁谷 全国大会帯同のため不在」など。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.shift_print_notes (
  year_month text primary key,   -- 'YYYY-MM'
  note       text,
  updated_at timestamptz not null default now()
);

alter table public.shift_print_notes enable row level security;
drop policy if exists shift_print_notes_staff_all on public.shift_print_notes;
create policy shift_print_notes_staff_all on public.shift_print_notes
  for all to authenticated using (true) with check (true);
