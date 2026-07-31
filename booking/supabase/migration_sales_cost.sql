-- 物販の仕入れ（原価）。スタッフ売上には販売価格−仕入れ（粗利）を反映するために使う。
-- 現金/キャッシュレス内訳・合計額は販売価格（実額）のまま。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales add column if not exists cost int not null default 0;
