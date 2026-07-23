-- 体幹教室の会員パス種別（月間パス4回 / フリーパス）。氏名で管理。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.class_members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  pass_type  text not null default 'month4', -- 'month4'（月4回） | 'free'（フリー）
  quota      int  not null default 4,        -- 月間の回数（month4=4）
  note       text,
  created_at timestamptz not null default now()
);

alter table public.class_members enable row level security;
drop policy if exists class_members_staff_all on public.class_members;
create policy class_members_staff_all on public.class_members
  for all to authenticated using (true) with check (true);
