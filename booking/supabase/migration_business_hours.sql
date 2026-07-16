-- =====================================================================
--  移行SQL: 営業時間の基本形（business_hours）を追加
--  既に稼働中のDBに対して、この1ファイルを Supabase の SQL Editor で
--  一度だけ実行してください（何度実行しても安全な冪等スクリプト）。
-- =====================================================================

create table if not exists public.business_hours (
  weekday    smallint primary key check (weekday between 0 and 6),
  is_open    boolean not null default true,
  seg1_start int,
  seg1_end   int,
  seg2_start int,
  seg2_end   int
);

alter table public.business_hours enable row level security;

drop policy if exists business_hours_public_read on public.business_hours;
create policy business_hours_public_read on public.business_hours for select using (true);

drop policy if exists business_hours_staff_all on public.business_hours;
create policy business_hours_staff_all on public.business_hours
  for all to authenticated using (true) with check (true);

-- 初期値：月〜土 10:00-13:00 / 16:00-20:30、日曜は休み
insert into public.business_hours (weekday, is_open, seg1_start, seg1_end, seg2_start, seg2_end) values
  (0, false, null, null, null, null),
  (1, true,  600, 780, 960, 1230),
  (2, true,  600, 780, 960, 1230),
  (3, true,  600, 780, 960, 1230),
  (4, true,  600, 780, 960, 1230),
  (5, true,  600, 780, 960, 1230),
  (6, true,  600, 780, 960, 1230)
on conflict (weekday) do nothing;

-- 管理ボードの表示範囲（時間外の枠もこの範囲にドラッグで追加できる）
alter table public.settings add column if not exists board_start_min int not null default 600;  -- 10:00
alter table public.settings add column if not exists board_end_min   int not null default 1320; -- 22:00
