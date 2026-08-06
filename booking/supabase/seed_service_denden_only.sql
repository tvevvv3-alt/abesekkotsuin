-- 「全身通電のみ」メニュー（待合で急に頼まれた時用）。
-- 工程は全身通電20分（機器）のみ。担当を選んで予約＝売上に計上できる。
-- 患者WEB予約には出さない（published=false）。管理のボード/カレンダーから追加で使う。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

do $$
declare
  eq_hc uuid;
  s_id  uuid;
begin
  select id into eq_hc from public.equipment where name = '全身通電' limit 1;

  if not exists (select 1 from public.services where name = '全身通電のみ') then
    insert into public.services (name, description, category, published, sort_order)
    values ('全身通電のみ', '全身通電（ハイチャージ）20分のみ。担当を選んで売上に計上できます。', 'その他', false, 7)
    returning id into s_id;

    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount)
    values (s_id, 1, '全身通電', 20, false, eq_hc, 1);
  end if;
end $$;
