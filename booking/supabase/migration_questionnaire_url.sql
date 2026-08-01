-- 問診票（Googleフォーム等）へのリンクURL。基本設定で登録し、左メニュー「問診票」から開く。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings add column if not exists questionnaire_url text;
