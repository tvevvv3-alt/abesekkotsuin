-- 体幹教室 申込書（アプリ内）：患者ごとに1件保存。
--   answers … 申込書の全回答（jsonb）
-- settings へ:
--   class_application_inapp … LINEの申込書リンクをアプリ内フォームにする（OFF=Googleフォーム）
--   application_schema       … 申込書の質問定義（QSection[]のJSON）。null=既定を使用
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。
create table if not exists public.patient_application (
  patient_id   uuid primary key references public.patients(id) on delete cascade,
  answers      jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_at  timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.patient_application enable row level security;
drop policy if exists patient_application_staff_all on public.patient_application;
create policy patient_application_staff_all on public.patient_application
  for all to authenticated using (true) with check (true);

alter table public.settings add column if not exists class_application_inapp boolean not null default false;
alter table public.settings add column if not exists application_schema jsonb;
