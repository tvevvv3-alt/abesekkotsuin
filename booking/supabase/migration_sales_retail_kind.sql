-- 物販の行種別：sale=売上（購入者への販売）/ purchase=仕入（まとめ買い）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales add column if not exists retail_kind text not null default 'sale';
