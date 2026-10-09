-- 体幹教室カルテ：来院(予約)ごとの自由メモ。1来院＝1レコード（appointment_id で一意）。
-- 8回枠の各回メモとして使う。日付は予約から自動なのでここには持たない。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.class_notes (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  note           text,
  updated_at     timestamptz not null default now()
);

alter table public.class_notes enable row level security;
drop policy if exists class_notes_staff_all on public.class_notes;
create policy class_notes_staff_all on public.class_notes
  for all to authenticated using (true) with check (true);
