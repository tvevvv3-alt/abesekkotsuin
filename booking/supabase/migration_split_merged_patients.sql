-- 【一回きり】すでにマージされた親子・兄弟を氏名ごとに分離する。
-- 予約(appointments)の patient_name と、紐づく患者(patients)の name が食い違うものを、
-- 「電話番号＋氏名(スペース差は無視)」が一致する患者へ付け替える（無ければ新規作成）。
--
-- 先に migration_family_patient_match.sql（book_appointmentの修正）を実行してから、これを実行すること。
-- ※新しく作られる患者レコードは氏名と電話のみ。フリガナ・生年月日は空になるので、
--   必要なら後から患者情報を入力してください（元レコードは上書きで失われているため）。
-- Supabase の SQL Editor で実行（再実行しても安全：既に分離済みは対象外になる）。

do $$
declare
  r      record;
  v_pid  uuid;
  v_num  text;
begin
  for r in
    select a.id as appt_id, a.patient_name, p.phone as phone
      from appointments a
      join patients p on p.id = a.patient_id
     where a.patient_name is not null
       and btrim(a.patient_name) <> ''
       and regexp_replace(a.patient_name, '[[:space:]　]', '', 'g')
         <> regexp_replace(coalesce(p.name, ''), '[[:space:]　]', '', 'g')
  loop
    -- 電話＋氏名(スペース無視)が一致する患者を探す
    select id into v_pid
      from patients
     where coalesce(phone, '') = coalesce(r.phone, '')
       and regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g')
         = regexp_replace(r.patient_name, '[[:space:]　]', '', 'g')
     order by created_at
     limit 1;

    if v_pid is null then
      select 'B' || lpad((count(*) + 1)::text, 5, '0') into v_num from patients;
      insert into patients (patient_number, name, phone)
      values (v_num, r.patient_name, r.phone)
      returning id into v_pid;
    end if;

    update appointments set patient_id = v_pid where id = r.appt_id;
  end loop;
end $$;
