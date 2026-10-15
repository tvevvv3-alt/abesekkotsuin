-- 管理画面の右下に出す「公式LINEを開く」ボタンのリンク先。
-- 例) https://line.me/R/ti/p/@xxxxxxx  または  https://lin.ee/xxxxxxx
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings add column if not exists line_oa_url text;
