-- 個別売上に「負担額（窓口負担・保険分）」列を追加。
-- 保険外(自費)=selfpay / 合計額(保険総額)=insurance / 負担額=burden。
-- 入金額=自費+負担額、合計=自費+合計額 は画面で自動計算。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.sales add column if not exists burden int not null default 0;
