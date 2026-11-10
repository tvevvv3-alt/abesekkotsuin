-- パーソナル回数券：完了（アーカイブ）フラグ。
--   archived=true の券は一覧から隠れる（削除はしない＝売上・来院・履歴は残る）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。
alter table public.personal_tickets add column if not exists archived boolean not null default false;

notify pgrst, 'reload schema';
