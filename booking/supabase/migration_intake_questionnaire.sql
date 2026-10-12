-- アプリ内問診票：回答一式を patient_intake に保存。
--   questionnaire … 問診票の全回答（JSON）
--   submitted_at  … 患者がLINEから送信した日時（スタッフ入力時はnull可）
-- settings.questionnaire_inapp … ON のとき、LINEの問診票リンクをアプリ内問診票にする
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.patient_intake add column if not exists questionnaire jsonb not null default '{}'::jsonb;
alter table public.patient_intake add column if not exists submitted_at timestamptz;

alter table public.settings add column if not exists questionnaire_inapp boolean not null default false;
