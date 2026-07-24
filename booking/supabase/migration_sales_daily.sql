-- レセコンの日計（保険側）を1日1行で記録。個別自費の集計と突合するため。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.sales_daily (
  date            date primary key,
  insurance_total int not null default 0, -- 合計額（保険総額）
  burden          int not null default 0, -- 負担額／入金額（窓口負担・保険分）
  created_at      timestamptz not null default now()
);

alter table public.sales_daily enable row level security;
drop policy if exists sales_daily_staff_all on public.sales_daily;
create policy sales_daily_staff_all on public.sales_daily
  for all to authenticated using (true) with check (true);
