-- シフト表から自動生成した予約枠（openings/closures）を識別するための source 列。
-- 'shift' = シフトカレンダーから自動生成（再反映時に作り直す）。null = 手動。
alter table public.closures add column if not exists source text;
alter table public.openings add column if not exists source text;
