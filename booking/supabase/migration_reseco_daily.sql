-- レセコンの日計表（月次CSV）を1日1行で保存。日計表(月)の合計を自動反映するため。
-- 患者ごと・担当別の内訳はCSVに無いので、そこは個別売上（患者ごと入力）で持つ。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.reseco_daily (
  date          date primary key,
  count         int not null default 0, -- 件数
  shinken       int not null default 0, -- 初検件数
  insurance     int not null default 0, -- 合計額
  burden        int not null default 0, -- 負担額
  selfpay_total int not null default 0, -- 保険外金額（合計）
  window_total  int not null default 0, -- 窓口徴収額計
  created_at    timestamptz not null default now()
);

alter table public.reseco_daily enable row level security;
drop policy if exists reseco_daily_staff_all on public.reseco_daily;
create policy reseco_daily_staff_all on public.reseco_daily
  for all to authenticated using (true) with check (true);
