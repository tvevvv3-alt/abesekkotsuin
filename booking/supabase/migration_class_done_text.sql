-- 体幹教室「終了」メッセージを管理画面から編集できるように
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings add column if not exists class_done_text text;
