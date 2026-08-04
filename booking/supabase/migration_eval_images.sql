-- 体幹評価レポートの項目イラスト（身体操作/バランス/壁倒立/吊り革/BOXジャンプ）URL。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings
  add column if not exists eval_images jsonb;
