-- 新患名簿（完全新規の記録。予約・患者管理とは独立した手入力の名簿）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.new_patients (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,             -- 来院日
  insurance    text not null default '',  -- 保険種別（自費/組合家族 など）
  name         text not null default '',  -- 氏名
  kana         text not null default '',  -- フリガナ
  existing_no  text not null default '',  -- 既存番号
  category     text not null default '',  -- 種別
  referrer     text not null default '',  -- 紹介者
  area_code    text not null default '',  -- 住所区分（茨/高/摂/他）
  area         text not null default '',  -- 住所（エリア名）
  taikan       boolean not null default false, -- 体幹教室
  kawanishi    boolean not null default false, -- 川西院
  created_at   timestamptz not null default now()
);
create index if not exists new_patients_date_idx on public.new_patients (date);
alter table public.new_patients enable row level security;
drop policy if exists new_patients_staff_all on public.new_patients;
create policy new_patients_staff_all on public.new_patients
  for all to authenticated using (true) with check (true);
