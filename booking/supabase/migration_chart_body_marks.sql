-- 自費カルテ（chart_entries）に身体図のマークを追加。
--   body_marks … 前面/背面に置いた痛み・こり・しびれ・治療ポイントの配列（JSON）
--     例: [{"id":"..","side":"front","x":0.42,"y":0.3,"type":"pain"}, ...]
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.chart_entries add column if not exists body_marks jsonb not null default '[]'::jsonb;
