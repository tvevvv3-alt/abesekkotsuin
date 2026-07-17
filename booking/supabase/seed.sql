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

-- フリガナ・表示名・役職・所属院（HP実データ。未設定のみ）
update public.staff set name_kana = 'アベ コウヤ',   role = '院長／柔道整復師',   clinic = '茨木本院', display_name = coalesce(display_name,'阿部') where name = '阿部' and name_kana is null;
update public.staff set name_kana = 'シブタニ ケイスケ', role = '副院長／鍼灸師', clinic = '茨木本院', display_name = coalesce(display_name,'澁谷') where name = '澁谷' and name_kana is null;
update public.staff set name_kana = 'ハギワラ リョウタ', role = 'スタッフ／柔道整復師', clinic = '茨木本院', display_name = coalesce(display_name,'萩原') where name = '萩原' and name_kana is null;
update public.staff set name_kana = 'ハヤシ トワ',    role = 'スタッフ／柔道整復師', clinic = '茨木本院', display_name = coalesce(display_name,'林')   where name = '林'   and name_kana is null;

-- 患者向け紹介文（管理画面のスタッフ管理から編集できます）
update public.staff set bio = coalesce(bio, '大阪薫英女学院高校・大阪人間科学大学女子バスケットボール部、RISE選手などのトレーナーを担当。スポーツ外傷から慢性的な不調まで、根本改善を目指した施術を行っています。') where name = '阿部';
update public.staff set bio = coalesce(bio, '昇陽高校男子バレーボール部トレーナーを担当。微弱電流治療と手技を組み合わせ、スポーツ外傷から慢性的な不調まで幅広く対応しています。') where name = '澁谷';
update public.staff set bio = coalesce(bio, 'AVANTI茨木トレーナーを担当。学生アスリートから一般の方まで、一人ひとりに寄り添った施術を心掛けています。') where name = '萩原';
update public.staff set bio = coalesce(bio, '体幹教室を担当し、施術も行っています。患者様一人ひとりに寄り添い、安心して通っていただけるよう丁寧な施術を心掛けています。') where name = '林';

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
      (s_id, 1, '全身通電', 30, false, eq_hc, 1),  -- 通電の実施は20分・占有枠は30分（施術が次の30分グリッド=+30分から始まる）
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
      (s_id, 1, '全身通電', 30, false, eq_hc, 1),  -- 通電の実施は20分・占有枠は30分（施術が次の30分グリッド=+30分から始まる）
      (s_id, 2, '施術',     30, true,  null,  1);
  end if;

  -- 施術60分（担当者のみ）
  if not exists (select 1 from public.services where name = '施術60分') then
    insert into public.services (name, description, sort_order) values ('施術60分', '担当者による施術60分', 4) returning id into s_id;
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '施術', 60, true, null, 1);
  end if;

  -- 体幹教室（定員4名のクラス・30分）
  --   担当者に紐づかず、同時刻の予約人数(0〜4)で管理する。
  --   患者側は「残○/満」、管理側は「○/4」で表示。
  if not exists (select 1 from public.services where name = '体幹教室') then
    insert into public.services (name, description, capacity, sort_order)
      values ('体幹教室', '体幹トレーニング指導 30分（定員4名のグループレッスン）', 4, 5) returning id into s_id;
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '体幹教室', 30, false, null, 1);
  end if;
  -- 既存 DB の体幹教室を新仕様（定員4・担当者なし・30分）へ更新
  update public.services
     set capacity = 4,
         description = '体幹トレーニング指導 30分（定員4名のグループレッスン）'
   where name = '体幹教室' and capacity <> 4;
  update public.service_steps ss
     set duration_min = 30, uses_staff = false, equipment_id = null
    from public.services s
   where ss.service_id = s.id and s.name = '体幹教室'
     and (ss.duration_min <> 30 or ss.uses_staff = true);
  -- 体幹教室：カテゴリー＝体幹教室 / 新規受付停止 / 患者向け表示名
  update public.services
     set category = '体幹教室', new_booking = false,
         patient_name = '体幹教室【新規受付停止中】'
   where name = '体幹教室';

  -- 時間外予約（20:30以降・施術30分）
  if not exists (select 1 from public.services where name = '時間外予約') then
    insert into public.services (name, description, category, sort_order)
      values ('時間外予約',
        '通常時間外（20:30以降）に施術を希望する方向けです。急な怪我や通常枠が埋まっている場合にご利用ください（学生＋¥550／一般＋¥2,750）。施術30分＋全身通電20分・施術60分をご希望の場合は電話またはLINEでご連絡ください。',
        'その他', 6) returning id into s_id;
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '施術', 30, true, null, 1);
  end if;
  -- 時間外予約：勤務時間に縛られない固定の夜枠のみ（20:30/21:00/21:30）
  update public.services
     set after_hours = true, class_starts = '1230,1260,1290'
   where name = '時間外予約';

  -- 川西整体院（担当者のみ・施術50分）
  if not exists (select 1 from public.services where name = '川西整体院') then
    insert into public.services (name, description, category, sort_order)
      values ('川西整体院', '川西整体院での施術（50分）。開始時刻 10:00/11:00/12:00/16:00/17:00/18:00/19:00/20:00。予約可能日は管理画面から指定します（LINE受付・現金/PayPay）。', '川西整体院', 7) returning id into s_id;
    insert into public.service_steps (service_id, step_order, name, duration_min, uses_staff, equipment_id, headcount) values
      (s_id, 1, '施術', 50, true, null, 1);
  end if;
end $$;

-- 体幹教室：HP実データ（開始 17:00/18:00/19:30 の3回・小3〜中学生・少人数4名）
--   1020=17:00 / 1080=18:00 / 1170=19:30。曜日により2回/1回の日は休診設定で調整。
update public.services
   set description = '体幹トレーニング指導（定員4名のグループレッスン・小3〜中学生対象）。開始 17:00／18:00／19:30（曜日により回数が変わります）。',
       class_starts = '1020,1080,1170',
       note = '月額制サブスク：月4回コース¥4,400／フリーパス¥8,150（通い放題・目安は多くて週2回程度）。予約1回ごとの課金ではなく月謝制のため、料金表(初診/再診)には登録しない。'
 where name = '体幹教室';

-- 一覧カード用のバッジ・短い説明（未設定のみ。管理画面から編集できます）
update public.services set badge = coalesce(badge,'基本'),   short_desc = coalesce(short_desc,'担当者による施術30分の基本メニューです。')          where name = '施術30分';
update public.services set badge = coalesce(badge,'集中ケア'), short_desc = coalesce(short_desc,'慢性症状や、じっくり施術を受けたい方向けです。')      where name = '施術60分';
update public.services set badge = coalesce(badge,'20:30以降'), short_desc = coalesce(short_desc,'通常時間外に施術を希望する方向けです。')          where name = '時間外予約';
update public.services set short_desc = coalesce(short_desc,'まず全身通電で身体を整えやすい状態にし、その後30分間の施術を行います。')          where name = '施術30分＋全身通電20分';
update public.services set short_desc = coalesce(short_desc,'定員4名の少人数制体幹トレーニングです。')                                          where name = '体幹教室';
update public.services set short_desc = coalesce(short_desc,'川西整体院での整体施術（50分）です。')                                            where name = '川西整体院';

-- ---------- 勤務時間（HP実データ：茨木本院 月〜土, 午前/午後の2枠）------
--  午前 10:00-13:00 (600-780) / 午後 16:00-20:30 (960-1230)
--  日曜(0)は休診（スケジュール無し）／不定休（完全予約制）
do $$
declare
  st record;
  wd int;
begin
  for st in select id from public.staff where bookable and active loop
    for wd in 1..6 loop
      if not exists (select 1 from public.staff_schedules where staff_id = st.id and weekday = wd) then
        insert into public.staff_schedules (staff_id, weekday, start_min, end_min) values
          (st.id, wd, 600, 780),   -- 10:00-13:00
          (st.id, wd, 960, 1230);  -- 16:00-20:30
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

-- ---------- スタッフ×メニュー 対応表（初期値。既に登録があれば触らない）------
do $$
declare
  abe uuid; sby uuid; hgw uuid; hys uuid;
  m_ichi uuid; m_s30 uuid; m_s60 uuid; m_out uuid; m_tk uuid; m_kw uuid;
begin
  if exists (select 1 from public.staff_services) then return; end if;
  select id into abe from public.staff where name='阿部' limit 1;
  select id into sby from public.staff where name='澁谷' limit 1;
  select id into hgw from public.staff where name='萩原' limit 1;
  select id into hys from public.staff where name='林'   limit 1;
  select id into m_ichi from public.services where name='施術30分＋全身通電20分' limit 1;
  select id into m_s30  from public.services where name='施術30分' limit 1;
  select id into m_s60  from public.services where name='施術60分' limit 1;
  select id into m_out  from public.services where name='時間外予約' limit 1;
  select id into m_tk   from public.services where name='体幹教室' limit 1;
  select id into m_kw   from public.services where name='川西整体院' limit 1;

  insert into public.staff_services (staff_id, service_id) values
    (abe,m_ichi),(abe,m_s30),(abe,m_s60),(abe,m_out),(abe,m_kw),
    (sby,m_ichi),(sby,m_s30),(sby,m_s60),(sby,m_out),
    (hgw,m_ichi),(hgw,m_s30),(hgw,m_s60),(hgw,m_tk),
    (hys,m_ichi),(hys,m_s30),(hys,m_s60),(hys,m_tk)
  on conflict do nothing;
end $$;

-- ---------- 料金（HP実データ。スタッフ別・初診/再診）------------------
--  施術30分＋全身通電20分 は「施術30分＋一般¥3,300」で算出。
--  林は萩原と同額。川西整体院は一律（初診¥12,000/再診¥10,000）。
--  時間外予約(加算)・体幹教室(月額)は別体系のため未登録。
do $$
declare
  abe uuid; sby uuid; hgw uuid; hys uuid;
  m_ichi uuid; m_s30 uuid; m_s60 uuid; m_kw uuid;
begin
  if exists (select 1 from public.service_prices) then return; end if;
  select id into abe from public.staff where name='阿部' limit 1;
  select id into sby from public.staff where name='澁谷' limit 1;
  select id into hgw from public.staff where name='萩原' limit 1;
  select id into hys from public.staff where name='林'   limit 1;
  select id into m_ichi from public.services where name='施術30分＋全身通電20分' limit 1;
  select id into m_s30  from public.services where name='施術30分' limit 1;
  select id into m_s60  from public.services where name='施術60分' limit 1;
  select id into m_kw   from public.services where name='川西整体院' limit 1;

  insert into public.service_prices (service_id, staff_id, initial_price, repeat_price) values
    -- 施術30分
    (m_s30, abe, 7700, 5500),(m_s30, sby, 7150, 4950),(m_s30, hgw, 6600, 4400),(m_s30, hys, 6600, 4400),
    -- 施術60分
    (m_s60, abe, 13200, 11000),(m_s60, sby, 12100, 10000),(m_s60, hgw, 11000, 8800),(m_s60, hys, 11000, 8800),
    -- 施術30分＋全身通電20分（＝施術30分＋一般¥3,300）
    (m_ichi, abe, 11000, 8800),(m_ichi, sby, 10450, 8250),(m_ichi, hgw, 9900, 7700),(m_ichi, hys, 9900, 7700),
    -- 川西整体院（一律）
    (m_kw, abe, 12000, 10000)
  on conflict do nothing;
end $$;

-- ---------- デモ用休診（今週の日曜は元々休、土曜午後を院全体休診に）--
insert into public.closures (date, staff_id, start_min, end_min, reason)
select (date_trunc('week', current_date)::date + 5), null, 960, 1230, '院内研修'
where not exists (
  select 1 from public.closures
  where date = (date_trunc('week', current_date)::date + 5) and reason = '院内研修'
);
