-- パーソナル「終了」時のお礼メッセージ本文（差し込みタグ {名前}{予約URL}{残り}）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings
  add column if not exists personal_done_text text;
