-- 自費の自動計算用：スタッフ毎の料金表＋共通オプション。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

-- スタッフ毎の基本料金（30分/60分 × 初診/再診）を JSON で保持
-- 例: {"p30f":7700,"p30r":5500,"p60f":13200,"p60r":11000}
alter table public.staff add column if not exists self_prices jsonb;

-- 共通オプション（通電/時間外の加算・学生判定年齢）を JSON で保持
-- 例: {"tsuden_ippan":3300,"tsuden_gakusei":2750,"jikangai_ippan":2750,"jikangai_gakusei":550,"student_max_age":22}
alter table public.settings add column if not exists self_options jsonb;
