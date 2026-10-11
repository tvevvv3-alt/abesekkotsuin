-- 自費カルテ「初診時ページ」：問診票の内容＋人体図（患者ごとに1件）。
--   sport/weekly_freq/symptom_area/onset/history … 問診票の各項目
--   body_marks … 全身図の描き込み（線ストローク配列）
--   joint_details … 関節ごとの前後左右の描き込み { "<関節>": { front:[], back:[], left:[], right:[] } }
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.patient_intake (
  patient_id    uuid primary key references public.patients(id) on delete cascade,
  sport         text,
  weekly_freq   text,
  symptom_area  text,
  onset         text,
  history       text,
  body_marks    jsonb not null default '[]'::jsonb,
  joint_details jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

alter table public.patient_intake enable row level security;
drop policy if exists patient_intake_staff_all on public.patient_intake;
create policy patient_intake_staff_all on public.patient_intake
  for all to authenticated using (true) with check (true);
