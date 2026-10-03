-- 簡易カルテ用：カルテメモ（症状・申し送り等）。
-- 紹介元は新患名簿(new_patients.referrer)から氏名でリンク表示するので、patients側には持たない。
-- 日別入力で患者名タップ → 情報ポップアップで表示・編集する。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.patients add column if not exists chart_note text;  -- カルテメモ
