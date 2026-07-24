-- 会計ごとの支払方法（現金 or キャッシュレス）。窓口額計(=負担額+保険外)を
-- 現金売上／キャッシュレスに自動仕訳するため。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales add column if not exists payment text not null default 'cash';
