-- 来院(予約)ごとの電子カルテ記録。主に自費患者向け（保険併用は手書き運用）。
-- 1来院＝1レコード（appointment_id で一意）。主訴/所見/経過/施術内容/メモ。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.chart_entries (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  patient_id     uuid,
  staff_id       uuid,          -- 記録者（その来院の担当）
  date           date,
  complaint      text,          -- 主訴
  findings       text,          -- 所見
  progress       text,          -- 経過
  treatment      text,          -- 施術内容
  note           text,          -- メモ
  updated_at     timestamptz not null default now()
);
create index if not exists chart_entries_patient_idx on public.chart_entries (patient_id);

alter table public.chart_entries enable row level security;
drop policy if exists chart_entries_staff_all on public.chart_entries;
create policy chart_entries_staff_all on public.chart_entries
  for all to authenticated using (true) with check (true);
