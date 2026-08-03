-- パーソナル回数券：会員の初期登録（スプレッドシート「6パーソナル回数券」より）。
-- 1〜15行のうち 4・12・14 を除いた12名。担当は青=阿部を既定で設定。
-- （紫=萩原の方は、あとでアプリの担当プルダウン、または下部のUPDATEで切替）
-- 何度実行しても安全（重複追加なし）。personal_tickets 未作成でも動きます。

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

-- 以前のシードで入れた不要な会員を削除（来院データはまだ無い前提）
delete from public.personal_tickets
where kind = 'パーソナル'
  and (
    name in ('新井ローサ', '小原弥', '篠原一遙', '江田和博', '梅原翔久')
    or (name = '新名圭汰' and expiry = '4月末')
  );

-- 12名を登録（担当＝阿部を既定。同じ氏名×有効期限が無い場合のみ追加）
insert into public.personal_tickets (name, staff_id, expiry, kind, quota, sort_order)
select v.name,
       (select id from public.staff where name like '%阿部%' order by sort_order limit 1),
       v.expiry, 'パーソナル', 6, v.ord
from (values
  ('木内智子',   '8月末',  1),
  ('井手翔太',   '10月末', 2),
  ('山本倫平',   '12月末', 3),
  ('新名圭汰',   '11月末', 4),
  ('神田歩斗',   '10月末', 5),
  ('前田透冴',   '11月末', 6),
  ('辻内暁斗',   '11月末', 7),
  ('津田雄大',   '11月末', 8),
  ('池田壮司郎', '11月末', 9),
  ('須川朔太郎', '10月末', 10),
  ('上田龍太郎', '11月末', 11),
  ('大西貴則',   '12月末', 12)
) as v(name, expiry, ord)
where not exists (
  select 1 from public.personal_tickets p
  where p.name = v.name and coalesce(p.expiry, '') = coalesce(v.expiry, '')
);

-- 既にシード済みで担当が未設定の行にも 阿部 を設定
update public.personal_tickets
set staff_id = (select id from public.staff where name like '%阿部%' order by sort_order limit 1)
where kind = 'パーソナル' and staff_id is null;

-- ▼ 紫＝萩原の方がいれば、氏名を並べて実行（担当を萩原に変更）
-- update public.personal_tickets
-- set staff_id = (select id from public.staff where name like '%萩原%' order by sort_order limit 1)
-- where kind = 'パーソナル' and name in ('○○', '△△');
