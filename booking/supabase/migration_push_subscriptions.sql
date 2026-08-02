-- 運営端末へのWebプッシュ通知：購読情報を保存するテーブル。
-- Supabase の SQL Editor で1回実行（再実行しても安全）。

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- 保存・送信はサーバー(service role)経由なので、匿名の直接読み書きは不要。
-- 管理画面(authenticated)からの参照だけ許可しておく。
drop policy if exists push_subscriptions_admin on public.push_subscriptions;
create policy push_subscriptions_admin on public.push_subscriptions
  for all to authenticated using (true) with check (true);
