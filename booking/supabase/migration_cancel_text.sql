-- キャンセル完了メッセージ本文（管理画面「基本設定」で編集）。null は既定テンプレート。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings add column if not exists cancel_text text;
