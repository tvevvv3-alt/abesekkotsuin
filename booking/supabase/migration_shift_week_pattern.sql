-- メンバーごとの「曜日パターン（週の基本シフト・週休2日など）」を保存する列。
-- 形式: 7要素の配列 [日,月,火,水,木,金,土]、各要素 { seg: 'off'|'all'|'am'|'pm'|'custom', start, end, clinic }
alter table public.shift_members add column if not exists week_pattern jsonb;
