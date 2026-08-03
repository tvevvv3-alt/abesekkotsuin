-- 体幹評価（3ヶ月に1回）。氏名ごとに履歴を保存し、今回/前回を比較する。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.core_evaluations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  eval_date  date not null default current_date,
  operation  int,   -- 身体操作 0-7
  balance    int,   -- バランス
  handstand  int,   -- 壁倒立
  ring       int,   -- 吊り革ぶら下がり
  boxjump    int,   -- BOXジャンプ
  comment    text,  -- 先生からの一言
  line_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists core_evaluations_name_idx on public.core_evaluations (name, eval_date);

alter table public.core_evaluations enable row level security;
drop policy if exists core_evaluations_staff_all on public.core_evaluations;
create policy core_evaluations_staff_all on public.core_evaluations
  for all to authenticated using (true) with check (true);

-- 画像（レポートPNG）保存用の公開バケット。ダッシュボードで作成済みなら不要。
-- ※ SQL でのバケット作成が有効な場合のみ。エラーになる場合は Storage 画面で
--   「eval」という Public バケットを手動作成してください（送信APIも作成を試みます）。
insert into storage.buckets (id, name, public)
values ('eval', 'eval', true)
on conflict (id) do nothing;
