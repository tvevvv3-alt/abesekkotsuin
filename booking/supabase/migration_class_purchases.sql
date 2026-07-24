-- 体幹教室：月ごとの購入状況（今月パス購入済みチェック・購入日）。氏名×年月で管理。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.class_purchases (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  ym            text not null,           -- 'YYYY-MM'
  purchased     boolean not null default false,
  purchase_date date,
  created_at    timestamptz not null default now(),
  unique (name, ym)
);
create index if not exists class_purchases_ym_idx on public.class_purchases (ym);

alter table public.class_purchases enable row level security;
drop policy if exists class_purchases_staff_all on public.class_purchases;
create policy class_purchases_staff_all on public.class_purchases
  for all to authenticated using (true) with check (true);
