-- シフト：施術スタッフ（阿部/澁谷/萩原/林）と受付・学生（上野/柴田/長尾）を1つの月間カレンダーに融合。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

-- シフトに載る人（施術スタッフ＋受付・学生）。施術スタッフも独立管理してシフト用に扱う。
create table if not exists public.shift_members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  role          text not null default 'therapist', -- therapist / reception / student / other
  color         text not null default '#64748b',
  default_start int,  -- 既定の出勤開始（分）。null=規定/終日
  default_end   int,  -- 既定の出勤終了（分）
  sort_order    int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.shift_members enable row level security;
drop policy if exists shift_members_staff_all on public.shift_members;
create policy shift_members_staff_all on public.shift_members
  for all to authenticated using (true) with check (true);

-- 日ごとの出勤（メンバー×日。時間帯・川西院フラグ・メモ）
create table if not exists public.shifts (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  member_id  uuid references public.shift_members(id) on delete cascade,
  start_min  int,  -- null=規定/終日
  end_min    int,
  clinic     text, -- null / 'kawanishi'（川西院）
  note       text, -- 任意（午前休診 等）
  created_at timestamptz not null default now()
);
create index if not exists shifts_date_idx on public.shifts (date);
alter table public.shifts enable row level security;
drop policy if exists shifts_staff_all on public.shifts;
create policy shifts_staff_all on public.shifts
  for all to authenticated using (true) with check (true);
