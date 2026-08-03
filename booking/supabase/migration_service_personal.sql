-- パーソナルトレーニングのメニューに「回数券対象」フラグを追加。
-- このフラグが立ったメニューの予約は、患者名で一致するパーソナル回数券に
-- 自動反映される（所要30分=1回・60分=2回を消費）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.services
  add column if not exists personal boolean not null default false;
