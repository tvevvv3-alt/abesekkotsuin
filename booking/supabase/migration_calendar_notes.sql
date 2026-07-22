-- カレンダーの自由メモ（受付シフト・zoom・ゴミ捨て等）。管理画面のみ使用。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.calendar_notes (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  start_min  int,          -- null = 終日（上部の帯）
  end_min    int,
  text       text not null,
  color      text,
  created_at timestamptz not null default now()
);
create index if not exists calendar_notes_date_idx on public.calendar_notes (date);

alter table public.calendar_notes enable row level security;
drop policy if exists calendar_notes_staff_all on public.calendar_notes;
create policy calendar_notes_staff_all on public.calendar_notes
  for all to authenticated using (true) with check (true);
