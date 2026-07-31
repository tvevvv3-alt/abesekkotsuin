-- 物販ページ（商品マスタ）とレンタルページ。個別売上(sales)に反映するための紐付けも。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

-- 商品マスタ（物販）
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  cost        int  not null default 0, -- 仕入れ（原価）
  price       int  not null default 0, -- 販売価格（既定）
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists products_staff_all on public.products;
create policy products_staff_all on public.products
  for all to authenticated using (true) with check (true);

-- sales に物販の紐付け（商品・数量）。物販の売上は sales 行として個別売上に反映。
alter table public.sales add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.sales add column if not exists qty int not null default 1;

-- レンタル（貸出/返却の管理＋レンタル料）。fee は sale_id 経由で個別売上に反映。
create table if not exists public.rentals (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,            -- 貸出日
  patient_name text not null default '', -- 名前
  item         text not null default '', -- 内容
  fee          int  not null default 0,  -- レンタル料
  staff_id     uuid references public.staff(id) on delete set null,
  due_date     date,                     -- 返却予定
  returned_on  date,                     -- 返却日（null=貸出中）
  sale_id      uuid references public.sales(id) on delete set null, -- 個別売上連携
  created_at   timestamptz not null default now()
);
create index if not exists rentals_date_idx on public.rentals (date);
alter table public.rentals enable row level security;
drop policy if exists rentals_staff_all on public.rentals;
create policy rentals_staff_all on public.rentals
  for all to authenticated using (true) with check (true);
