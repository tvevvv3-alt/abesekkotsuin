-- =====================================================================
--  阿部接骨院 予約システム  初期／デモデータ
--  前提: schema.sql を実行済み。
--  何度実行しても重複しないよう name / patient_number で判定します。
-- =====================================================================

-- ---------- 担当者（4名）＋カラー -----------------------------------
--  阿部:青 / 澁谷:緑 / 萩原:紫 / 林:オレンジ
insert into public.staff (name, role, color, sort_order, bookable)
select v.name, 'therapist', v.color, v.ord, true
from (values
  ('阿部', '#2563eb', 1),
  ('澁谷', '#16a34a', 2),
  ('萩原', '#7c3aed', 3),
  ('林',   '#ea580c', 4)
) as v(name, color, ord)
where not exists (select 1 from public.staff s where s.name = v.name);

-- 既存行にも色・並び順を反映（emr 由来のスタッフ等）
update public.staff set color = '#2563eb', sort_order = 1 where name = '阿部' and color is null;
update public.staff set color = '#16a34a', sort_order = 2 where name = '澁谷' and color is null;
update public.staff set color = '#7c3aed', sort_order = 3 where name = '萩原' and color is null;
update public.staff set color = '#ea580c', sort_order = 4 where name = '林'   and color is null;

-- ---------- 機器（ハイチャージ 同時4名）----------------------------
insert into public.equipment (name, capacity, sort_order)
select 'ハイチャージ', 4, 1
where not exists (select 1 from public.equipment where name = 'ハイチャージ');

-- ---------- メニューと工程 -----------------------------------------
do $$
declare
  eq_hc uuid;
  s_id  uuid;
begin
  select id into eq_hc from public.equipment where name = 'ハイチャージ' limit 1;

  -- 施術30分（担当者のみ）
  if not exists (select 1 from public.services where name = '施術30分') then
    insert into public.services (name, description, sort_order) values ('施術30分', '担当者による施術のみ', 1) returning id into s_id;
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '施術', 30, true, null, 1);
  end if;

  -- （廃止）全身通電30分→施術30分：既存 DB に残っていれば削除する
  delete from public.services where name = '全身通電30分→施術30分';

  -- 施術30分＋全身通電20分（イチオシ）
  --   患者への表示名は「施術30分＋全身通電20分」。
  --   ただし内部の工程は必ず「全身通電20分（機器）→ 施術30分（担当者）」の順で管理する。
  if not exists (select 1 from public.services where name = '施術30分＋全身通電20分') then
    insert into public.services (name, description, recommended, sort_order)
    values (
      '施術30分＋全身通電20分',
      'まず20分間の全身通電（ハイチャージ）で細胞を活性化し、その後30分間の施術で身体を整えます。身体を整えやすい状態を作ってから施術を行うことで、より効率的なコンディショニングと回復を目指す当院おすすめのメニューです。',
      true, 0
    ) returning id into s_id;
    -- 内部工程：全身通電20分（機器・4名まで）→ 施術30分（担当者）
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '全身通電', 20, false, eq_hc, 1),
      (s_id, 2, '施術',     30, true,  null,  1);
  end if;
  -- 旧メニュー（施術30分→全身通電20分）が残っていれば新仕様へ置き換える
  if exists (select 1 from public.services where name = '施術30分→全身通電20分') then
    update public.services
       set name = '施術30分＋全身通電20分',
           description = 'まず20分間の全身通電（ハイチャージ）で細胞を活性化し、その後30分間の施術で身体を整えます。身体を整えやすい状態を作ってから施術を行うことで、より効率的なコンディショニングと回復を目指す当院おすすめのメニューです。',
           recommended = true, sort_order = 0
     where name = '施術30分→全身通電20分'
     returning id into s_id;
    delete from public.service_steps where service_id = s_id;
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '全身通電', 20, false, eq_hc, 1),
      (s_id, 2, '施術',     30, true,  null,  1);
  end if;

  -- 施術60分（担当者のみ）
  if not exists (select 1 from public.services where name = '施術60分') then
    insert into public.services (name, description, sort_order) values ('施術60分', '担当者による施術60分', 4) returning id into s_id;
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '施術', 60, true, null, 1);
  end if;

  -- 体幹教室（担当者のみ 30分）
  if not exists (select 1 from public.services where name = '体幹教室') then
    insert into public.services (name, description, sort_order) values ('体幹教室', '体幹トレーニング指導 30分', 5) returning id into s_id;
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '体幹教室', 30, true, null, 1);
  end if;
  -- 既存 DB の体幹教室が60分のままなら30分へ更新
  if exists (select 1 from public.services s join public.service_steps ss on ss.service_id = s.id
             where s.name = '体幹教室' and ss.duration_min = 60) then
    update public.service_steps ss set duration_min = 30
      from public.services s
     where ss.service_id = s.id and s.name = '体幹教室';
    update public.services set description = '体幹トレーニング指導 30分' where name = '体幹教室';
  end if;
end $$;

-- ---------- 勤務時間（全担当者 月〜土, 午前/午後の2枠）--------------
--  午前 09:00-13:00 (540-780) / 午後 14:30-19:00 (870-1140)
--  日曜(0)は休診（スケジュール無し）
do $$
declare
  st record;
  wd int;
begin
  for st in select id from public.staff where bookable and active loop
    for wd in 1..6 loop
      if not exists (select 1 from public.staff_schedules where staff_id = st.id and weekday = wd) then
        insert into public.staff_schedules (staff_id, weekday, start_min, end_min) values
          (st.id, wd, 540, 780),   -- 09:00-13:00
          (st.id, wd, 870, 1140);  -- 14:30-19:00
      end if;
    end loop;
  end loop;
end $$;

-- ---------- デモ用予約（今週分。工程を展開して投入）----------------
--  月曜と火曜に、担当者占有・機器占有が分かる予約を数件入れる。
do $$
declare
  s_ichioshi uuid;     -- 施術30分＋全身通電20分（内部: 通電20→施術30）
  s_seko30   uuid;     -- 施術30分
  eq_hc      uuid;
  abe uuid; shibuya uuid;
  base date := date_trunc('week', current_date)::date; -- 今週の月曜
  ap  uuid;
begin
  select id into s_ichioshi from public.services where name = '施術30分＋全身通電20分' limit 1;
  select id into s_seko30   from public.services where name = '施術30分' limit 1;
  select id into eq_hc      from public.equipment where name = 'ハイチャージ' limit 1;
  select id into abe        from public.staff where name = '阿部' limit 1;
  select id into shibuya    from public.staff where name = '澁谷' limit 1;

  -- 既にデモ予約があれば入れ直さない
  if exists (select 1 from public.appointments where note = 'デモ') then
    return;
  end if;

  -- 予約A: 阿部・施術30分＋全身通電20分・月曜 11:00 来院
  --   内部工程1 全身通電 11:00-11:20 (機器) / 工程2 施術 11:20-11:50 (担当者)
  insert into public.appointments (service_id, staff_id, date, start_min, end_min, source, note, patient_name, service_name)
    values (s_ichioshi, abe, base, 660, 710, 'admin', 'デモ', '田中 太郎', '施術30分＋全身通電20分') returning id into ap;
  insert into public.appointment_steps (appointment_id, step_order, name, date, start_min, end_min, uses_staff, staff_id, equipment_id, headcount) values
    (ap, 1, '全身通電', base, 660, 680, false, null, eq_hc, 1),
    (ap, 2, '施術',     base, 680, 710, true,  abe,  null,  1);

  -- 予約B: 阿部・施術30分・月曜 10:00
  insert into public.appointments (service_id, staff_id, date, start_min, end_min, source, note, patient_name, service_name)
    values (s_seko30, abe, base, 600, 630, 'admin', 'デモ', '佐藤 花子', '施術30分') returning id into ap;
  insert into public.appointment_steps (appointment_id, step_order, name, date, start_min, end_min, uses_staff, staff_id, equipment_id, headcount) values
    (ap, 1, '施術', base, 600, 630, true, abe, null, 1);

  -- 予約C: 澁谷・施術30分＋全身通電20分・月曜 11:00（機器を同時にもう1名利用）
  insert into public.appointments (service_id, staff_id, date, start_min, end_min, source, note, patient_name, service_name)
    values (s_ichioshi, shibuya, base, 660, 710, 'admin', 'デモ', '鈴木 一郎', '施術30分＋全身通電20分') returning id into ap;
  insert into public.appointment_steps (appointment_id, step_order, name, date, start_min, end_min, uses_staff, staff_id, equipment_id, headcount) values
    (ap, 1, '全身通電', base, 660, 680, false, null, eq_hc, 1),
    (ap, 2, '施術',     base, 680, 710, true,  shibuya, null, 1);
end $$;

-- ---------- デモ用休診（今週の日曜は元々休、土曜午後を院全体休診に）--
insert into public.closures (date, staff_id, start_min, end_min, reason)
select (date_trunc('week', current_date)::date + 5), null, 870, 1140, '院内研修'
where not exists (
  select 1 from public.closures
  where date = (date_trunc('week', current_date)::date + 5) and reason = '院内研修'
);
