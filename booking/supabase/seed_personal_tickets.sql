-- パーソナル回数券：会員の初期登録（スプレッドシート「6パーソナル回数券」より）。
-- 1〜15行のうち 4・12・14 を除いた12名。
-- 担当：木内智子・上田龍太郎＝阿部（青）、それ以外＝萩原（紫）。
-- 何度実行しても安全（重複追加なし・担当も毎回正しく設定）。未作成でも動きます。

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

-- 12名を登録（同じ氏名×有効期限が無い場合のみ追加）
insert into public.personal_tickets (name, expiry, kind, quota, sort_order)
select v.name, v.expiry, 'パーソナル', 10, v.ord
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

-- 回数を10回に統一（初期の6回のまま残っていれば更新）
update public.personal_tickets set quota = 10 where kind = 'パーソナル' and quota = 6;

-- 担当を設定：阿部（木内智子・上田龍太郎）
update public.personal_tickets
set staff_id = (select id from public.staff where name like '%阿部%' order by sort_order limit 1)
where kind = 'パーソナル' and name in ('木内智子', '上田龍太郎');

-- 担当を設定：萩原（それ以外）
update public.personal_tickets
set staff_id = (select id from public.staff where name like '%萩原%' order by sort_order limit 1)
where kind = 'パーソナル'
  and name in ('井手翔太', '山本倫平', '新名圭汰', '神田歩斗', '前田透冴',
               '辻内暁斗', '津田雄大', '池田壮司郎', '須川朔太郎', '大西貴則');
