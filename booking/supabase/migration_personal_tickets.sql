-- パーソナルトレーニングの回数券（1行＝1冊）。体幹教室と別管理。
-- 来院日時は手入力（予約表とは連動しない。スプレッドシートの置き換え）。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.personal_tickets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  staff_id    uuid references public.staff(id) on delete set null, -- 担当
  expiry      text,                                   -- 有効期限（例：8月末）自由入力
  kind        text not null default 'パーソナル',      -- 種類
  quota       int  not null default 6,                -- 回数券の回数
  visits      jsonb not null default '[]'::jsonb,     -- 来院日時（datetime-local文字列の配列）
  note        text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.personal_tickets enable row level security;
drop policy if exists personal_tickets_staff_all on public.personal_tickets;
create policy personal_tickets_staff_all on public.personal_tickets
  for all to authenticated using (true) with check (true);
