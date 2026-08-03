-- パーソナル回数券：会員の初期登録（スプレッドシート「6パーソナル回数券」より）。
-- 氏名・有効期限・種類を登録。担当と来院日時はアプリ画面から入力してください。
-- 何度実行しても重複しないよう、同じ氏名×有効期限が無い場合のみ追加します。
-- ※ personal_tickets が未作成でも動くよう、テーブル作成も含めています。

create table if not exists public.personal_tickets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  staff_id    uuid references public.staff(id) on delete set null,
  expiry      text,
  kind        text not null default 'パーソナル',
  quota       int  not null default 6,
  visits      jsonb not null default '[]'::jsonb,
  note        text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.personal_tickets enable row level security;
drop policy if exists personal_tickets_staff_all on public.personal_tickets;
create policy personal_tickets_staff_all on public.personal_tickets
  for all to authenticated using (true) with check (true);

insert into public.personal_tickets (name, expiry, kind, quota, sort_order)
select v.name, v.expiry, 'パーソナル', 6, v.ord
from (values
  ('木内智子',   '8月末',  1),
  ('井手翔太',   '10月末', 2),
  ('山本倫平',   '12月末', 3),
  ('新井ローサ', null,     4),
  ('新名圭汰',   '11月末', 5),
  ('神田歩斗',   '10月末', 6),
  ('前田透冴',   '11月末', 7),
  ('辻内暁斗',   '11月末', 8),
  ('津田雄大',   '11月末', 9),
  ('池田壮司郎', '11月末', 10),
  ('須川朔太郎', '10月末', 11),
  ('小原弥',     null,     12),
  ('上田龍太郎', '11月末', 13),
  ('篠原一遙',   null,     14),
  ('大西貴則',   '12月末', 15),
  ('新名圭汰',   '4月末',  16),  -- 旧回数券（2冊目）
  ('江田和博',   '10月末', 17),
  ('梅原翔久',   '10月末', 18)
) as v(name, expiry, ord)
where not exists (
  select 1 from public.personal_tickets p
  where p.name = v.name and coalesce(p.expiry, '') = coalesce(v.expiry, '')
);
