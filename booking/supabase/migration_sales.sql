-- 個別売上（予約1件ごとに 保険合計額＋自費 を記録）。名前・担当は予約から自動。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid unique,          -- 予約と1:1（名前・担当を自動反映）
  date           date not null,
  staff_id       uuid,
  patient_name   text,
  insurance      int not null default 0, -- 保険合計額
  selfpay        int not null default 0, -- 自費（保険外）
  created_at     timestamptz not null default now()
);
create index if not exists sales_date_idx on public.sales (date);

alter table public.sales enable row level security;
drop policy if exists sales_staff_all on public.sales;
create policy sales_staff_all on public.sales
  for all to authenticated using (true) with check (true);

-- スタッフの月間売上目標（円）
alter table public.staff add column if not exists sales_target int not null default 0;
