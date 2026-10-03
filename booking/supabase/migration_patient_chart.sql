-- 簡易カルテ用：患者の紹介元（きっかけ）とカルテメモ。
-- 日別入力で患者名タップ → 情報ポップアップで表示・編集する。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.patients add column if not exists referral text;    -- 紹介元・来院のきっかけ
alter table public.patients add column if not exists chart_note text;  -- カルテメモ（症状・申し送り等）
