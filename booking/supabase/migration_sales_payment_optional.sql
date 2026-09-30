-- 支払方法を「未選択」で保存できるように（現金/キャッシュレスのボタンを押して確定する運用）。
-- 押し忘れで現金に誤計上され、締め作業で現金が合わない問題を防ぐため。
-- 既存の 'cash' はそのまま（確定済み扱い）。今後の新規は未選択(null)から。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales alter column payment drop not null;
alter table public.sales alter column payment drop default;
