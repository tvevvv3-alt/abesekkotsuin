-- 体幹教室の会員（class_members）に 競技・学年・チーム を追加。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.class_members add column if not exists sport text;  -- 競技
alter table public.class_members add column if not exists grade text;  -- 学年
alter table public.class_members add column if not exists team  text;  -- チーム
