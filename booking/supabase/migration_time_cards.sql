-- タイムカード（勤怠）：スタッフ×日 で1行。共用端末の打刻と月次集計に使用。
--   clock_in/clock_out … 出勤/退勤の時刻
--   break_min         … その日の休憩合計（分）。休憩戻りのたびに加算
--   break_started_at  … 休憩中の一時保持（戻り打刻で break_min に加算しクリア）
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。
create table if not exists public.time_cards (
  id               uuid primary key default gen_random_uuid(),
  staff_id         uuid not null references public.staff(id) on delete cascade,
  date             date not null,
  clock_in         timestamptz,
  clock_out        timestamptz,
  break_min        integer not null default 0,
  break_started_at timestamptz,
  note             text,
  updated_at       timestamptz not null default now(),
  unique (staff_id, date)
);
create index if not exists time_cards_date_idx on public.time_cards (date);

alter table public.time_cards enable row level security;
drop policy if exists time_cards_staff_all on public.time_cards;
create policy time_cards_staff_all on public.time_cards
  for all to authenticated using (true) with check (true);
