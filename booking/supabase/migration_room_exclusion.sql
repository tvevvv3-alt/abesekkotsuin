-- =====================================================================
--  トレーニングルーム排他 ＋ 関数オーバーロードの一本化
-- ---------------------------------------------------------------------
--  【背景】check_booking_availability は過去のマイグレーションで
--    5引数 / 6引数 / 7引数 の複数版がDBに残ることがあり、
--    book_appointment が 5引数（末尾 null）で呼ぶと
--    「function ... is not unique」エラーになる。
--  【対策】既存オーバーロードを全部DROPし、7引数版だけに一本化。
--    book_appointment / reschedule_appointment も 7引数で呼ぶよう再定義。
--
--  【部屋排他】パーソナルと体幹教室は同じトレーニングルームを使う：
--    ・パーソナル予約 … 同時刻に「パーソナル or 体幹教室」があれば不可（部屋1枠）
--    ・体幹教室予約  … 同時刻に「パーソナル」があれば不可
--    部屋の排他は管理者予約でも常に有効（物理的に1枠のため）。
--
--  Supabase の SQL Editor で1回実行（再実行しても安全）。
-- =====================================================================

-- ▼ 川西院など「解放日だけ営業」フラグ（基本休診・シフトの川西チェックで解放）
alter table public.services add column if not exists opening_only boolean not null default false;
update public.services set opening_only = true where category = '川西整体院';

-- ▼ 既存オーバーロードを全部破棄（曖昧さの元を断つ）
drop function if exists public.check_booking_availability(uuid, uuid, date, int, uuid);
drop function if exists public.check_booking_availability(uuid, uuid, date, int, uuid, boolean);
drop function if exists public.check_booking_availability(uuid, uuid, date, int, uuid, boolean, boolean);

-- ▼ 一本化した7引数版を作成
create or replace function public.check_booking_availability(
  p_service_id uuid,
  p_staff_id   uuid,
  p_date       date,
  p_start_min  int,
  p_exclude_appointment_id uuid default null,
  p_ignore_closures boolean default false,
  p_ignore_hours boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dow    int := extract(dow from p_date);
  v_cursor int := p_start_min;
  v_end    int;
  step     record;
  s_start  int;
  s_end    int;
  v_used   int;
  v_cap    int;
  v_ok     boolean;
  v_capacity int;
  v_after_hours boolean;
  v_personal boolean;
  v_opening_only boolean;
  v_bh     record;
begin
  if not exists (select 1 from service_steps where service_id = p_service_id) then
    return jsonb_build_object('ok', false, 'reason', 'メニューに工程がありません');
  end if;

  select p_start_min + coalesce(sum(duration_min), 0)
    into v_end
    from service_steps where service_id = p_service_id;

  select capacity, coalesce(after_hours, false), coalesce(personal, false), coalesce(opening_only, false)
    into v_capacity, v_after_hours, v_personal, v_opening_only
    from services where id = p_service_id;

  -- ===== 解放日だけ営業（川西院など）=====
  --   基本は休診。openings（解放枠）がある日・時間だけ予約可。
  --   拠点が別なので茨木の勤務/休診には縛られない（同担当の同時刻重複だけ見る）。
  if v_opening_only then
    if not exists (
      select 1 from openings o
       where o.service_id = p_service_id and o.date = p_date
         and o.start_min <= p_start_min and o.end_min >= v_end
    ) then
      return jsonb_build_object('ok', false, 'reason', '休診');
    end if;
    if not p_ignore_closures and exists (
      select 1 from closures c
       where c.date = p_date and c.service_id = p_service_id
         and (c.start_min is null or (c.start_min < v_end and c.end_min > p_start_min))
    ) then
      return jsonb_build_object('ok', false, 'reason', '休診');
    end if;
    if exists (
      select 1 from appointments ap
      where ap.service_id = p_service_id and ap.status = 'booked' and ap.date = p_date
        and ap.start_min < v_end and ap.end_min > p_start_min
        and (p_exclude_appointment_id is null or ap."id" != p_exclude_appointment_id)
    ) then
      return jsonb_build_object('ok', false, 'reason', '満');
    end if;
    return jsonb_build_object('ok', true, 'end_min', v_end);
  end if;

  -- ===== 定員制クラス（体幹教室など capacity>1）=====
  if coalesce(v_capacity, 1) > 1 then
    if not p_ignore_hours and not exists (
      select 1 from staff_schedules
       where weekday = v_dow and start_min <= p_start_min and end_min >= v_end
    ) and not exists (
      select 1 from openings o
       where o.service_id = p_service_id and o.date = p_date
         and o.start_min <= p_start_min and o.end_min > p_start_min
    ) then
      return jsonb_build_object('ok', false, 'reason', '営業時間外');
    end if;
    if not p_ignore_closures and exists (
      select 1 from closures c
       where c.date = p_date
         and ((c.staff_id is null and c.service_id is null) or c.service_id = p_service_id)
         and (c.start_min is null or (c.start_min < v_end and c.end_min > p_start_min))
    ) then
      return jsonb_build_object('ok', false, 'reason', '休診');
    end if;
    -- ★部屋排他：体幹教室の時間に「パーソナル」が入っていれば不可
    if exists (
      select 1 from appointments ap
      join services sv on sv.id = ap.service_id
      where ap.status = 'booked' and ap.date = p_date
        and sv.personal = true
        and ap.start_min < v_end and ap.end_min > p_start_min
        and (p_exclude_appointment_id is null or ap."id" != p_exclude_appointment_id)
    ) then
      return jsonb_build_object('ok', false, 'reason', '部屋が使用中（パーソナル）');
    end if;
    select count(*) into v_used
      from appointments ap
     where ap.service_id = p_service_id and ap.status = 'booked'
       and ap.date = p_date
       and ap.start_min < v_end and ap.end_min > p_start_min
       and (p_exclude_appointment_id is null or ap."id" != p_exclude_appointment_id);
    if v_used >= v_capacity then
      return jsonb_build_object('ok', false, 'reason', '満', 'used', v_used, 'capacity', v_capacity);
    end if;
    return jsonb_build_object('ok', true, 'end_min', v_end, 'used', v_used, 'capacity', v_capacity);
  end if;

  -- ===== 通常メニュー（capacity=1）=====
  -- ★パーソナルは「医院の営業時間内」のみ（時間外は不可）。管理者(p_ignore_hours)は除外。
  if v_personal and not p_ignore_hours then
    select * into v_bh from business_hours where weekday = v_dow;
    if v_bh is null or not coalesce(v_bh.is_open, false) or not (
      (v_bh.seg1_start is not null and v_bh.seg1_end is not null
        and v_bh.seg1_start <= p_start_min and v_bh.seg1_end >= v_end)
      or (v_bh.seg2_start is not null and v_bh.seg2_end is not null
        and v_bh.seg2_start <= p_start_min and v_bh.seg2_end >= v_end)
    ) then
      return jsonb_build_object('ok', false, 'reason', '営業時間外');
    end if;
  end if;

  -- ★部屋排他：パーソナル予約は、同時刻に「パーソナル or 体幹教室」があれば不可（部屋1枠）
  if v_personal then
    if exists (
      select 1 from appointments ap
      join services sv on sv.id = ap.service_id
      where ap.status = 'booked' and ap.date = p_date
        and (sv.personal = true or coalesce(sv.capacity, 1) > 1)
        and ap.start_min < v_end and ap.end_min > p_start_min
        and (p_exclude_appointment_id is null or ap."id" != p_exclude_appointment_id)
    ) then
      return jsonb_build_object('ok', false, 'reason', '部屋が使用中');
    end if;
  end if;

  -- ③ 勤務時間内（p_ignore_hours=true のとき＝管理者はスキップ）
  if not p_ignore_hours then
    if v_after_hours then
      if not exists (
        select 1 from staff_schedules where staff_id = p_staff_id and weekday = v_dow
      ) then
        return jsonb_build_object('ok', false, 'reason', '休診');
      end if;
    else
      select (exists (
        select 1 from staff_schedules
         where staff_id = p_staff_id and weekday = v_dow
           and start_min <= p_start_min and end_min >= v_end
      ) or exists (
        select 1 from openings o
         where o.staff_id = p_staff_id and o.date = p_date
           and o.start_min <= p_start_min and o.end_min >= v_end
      )) into v_ok;
      if not v_ok then
        return jsonb_build_object('ok', false, 'reason', '勤務時間外');
      end if;
    end if;
  end if;

  -- ④ 院全体休診（終日/時間帯）は予約全体をブロック
  if not p_ignore_closures and exists (
    select 1 from closures c
     where c.date = p_date
       and c.service_id is null
       and c.staff_id is null
       and (
         (c.start_min is null)
         or (c.start_min < v_end and c.end_min > p_start_min)
       )
  ) then
    return jsonb_build_object('ok', false, 'reason', '休診');
  end if;

  -- 工程ごとに担当者/機器の空きを判定
  for step in
    select * from service_steps where service_id = p_service_id order by step_order
  loop
    s_start := v_cursor;
    s_end   := v_cursor + step.duration_min;

    if step.uses_staff then
      if not p_ignore_closures and exists (
        select 1 from closures c
         where c.date = p_date
           and c.service_id is null
           and c.staff_id = p_staff_id
           and ((c.start_min is null) or (c.start_min < s_end and c.end_min > s_start))
      ) then
        return jsonb_build_object('ok', false, 'reason', '休診');
      end if;
      if exists (
        select 1 from appointment_steps a
        join appointments ap on ap."id" = a.appointment_id and ap.status = 'booked'
        where a.uses_staff
          and a.staff_id = p_staff_id
          and a.date = p_date
          and a.start_min < s_end and a.end_min > s_start
          and (p_exclude_appointment_id is null or a.appointment_id != p_exclude_appointment_id)
      ) then
        return jsonb_build_object('ok', false, 'reason', '担当者の空きなし', 'step', step.name);
      end if;
    end if;

    if step.equipment_id is not null then
      select coalesce(sum(a.headcount), 0) into v_used
      from appointment_steps a
      join appointments ap on ap."id" = a.appointment_id and ap.status = 'booked'
      where a.equipment_id = step.equipment_id
        and a.date = p_date
        and a.start_min < s_end and a.end_min > s_start
        and (p_exclude_appointment_id is null or a.appointment_id != p_exclude_appointment_id);
      select capacity into v_cap from equipment where id = step.equipment_id;
      if v_used + step.headcount > coalesce(v_cap, 1) then
        return jsonb_build_object('ok', false, 'reason', '機器の空きなし', 'step', step.name);
      end if;
    end if;

    v_cursor := s_end;
  end loop;

  return jsonb_build_object('ok', true, 'end_min', v_end);
end; $$;

grant execute on function public.check_booking_availability(uuid, uuid, date, int, uuid, boolean, boolean) to anon, authenticated;

-- ★ 予約確定：source='admin' のときは休診＋勤務時間を無視（7引数で呼ぶ）
create or replace function public.book_appointment(
  p_service_id uuid,
  p_staff_id   uuid,
  p_date       date,
  p_start_min  int,
  p_name       text,
  p_name_kana  text default null,
  p_birth_date date default null,
  p_phone      text default null,
  p_note       text default null,
  p_source     text default 'patient'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_check    jsonb;
  v_patient  uuid;
  v_appt     uuid;
  v_end      int;
  v_cursor   int;
  v_num      text;
  v_svc_name text;
  v_admin    boolean := (p_source = 'admin');
  step       record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_date::text, 0));

  v_check := check_booking_availability(
    p_service_id, p_staff_id, p_date, p_start_min, null, v_admin, v_admin
  );
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_check->>'reason', '予約不可'));
  end if;
  v_end := (v_check->>'end_min')::int;

  if p_phone is not null and length(trim(p_phone)) > 0 then
    select id into v_patient from patients where phone = p_phone order by created_at limit 1;
  end if;

  if v_patient is null then
    select 'B' || lpad((count(*) + 1)::text, 5, '0') into v_num from patients;
    insert into patients (patient_number, name, name_kana, birth_date, phone)
    values (v_num, p_name, p_name_kana, p_birth_date, p_phone)
    returning id into v_patient;
  else
    update patients set
      name = coalesce(nullif(trim(p_name), ''), name),
      name_kana = coalesce(nullif(trim(p_name_kana), ''), name_kana),
      birth_date = coalesce(p_birth_date, birth_date)
    where id = v_patient;
  end if;

  select name into v_svc_name from services where id = p_service_id;

  insert into appointments
    (patient_id, service_id, staff_id, date, start_min, end_min, status, source, note,
     patient_name, service_name)
  values
    (v_patient, p_service_id, p_staff_id, p_date, p_start_min, v_end, 'booked', p_source, p_note,
     p_name, v_svc_name)
  returning id into v_appt;

  v_cursor := p_start_min;
  for step in select * from service_steps where service_id = p_service_id order by step_order loop
    insert into appointment_steps
      (appointment_id, step_order, name, date, start_min, end_min,
       uses_staff, staff_id, equipment_id, service_id, headcount)
    values
      (v_appt, step.step_order, step.name, p_date, v_cursor, v_cursor + step.duration_min,
       step.uses_staff,
       case when step.uses_staff then p_staff_id else null end,
       step.equipment_id, p_service_id, step.headcount);
    v_cursor := v_cursor + step.duration_min;
  end loop;

  return jsonb_build_object('ok', true, 'appointment_id', v_appt, 'patient_id', v_patient);
end; $$;

grant execute on function public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text) to anon, authenticated;

-- ★ 予約変更：管理からのみ呼ばれるため休診＋勤務時間を常に無視（7引数で呼ぶ）
create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_service_id uuid,
  p_staff_id   uuid,
  p_date       date,
  p_start_min  int,
  p_note       text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_check  jsonb;
  v_end    int;
  v_cursor int;
  v_svc_name text;
  step     record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_date::text, 0));

  v_check := check_booking_availability(
    p_service_id, p_staff_id, p_date, p_start_min, p_appointment_id, true, true
  );
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_check->>'reason', '予約不可'));
  end if;
  v_end := (v_check->>'end_min')::int;
  select name into v_svc_name from services where id = p_service_id;

  update appointments set
    service_id = p_service_id, staff_id = p_staff_id, date = p_date,
    start_min = p_start_min, end_min = v_end, service_name = v_svc_name,
    note = coalesce(p_note, note), status = 'booked'
  where id = p_appointment_id;

  delete from appointment_steps where appointment_id = p_appointment_id;

  v_cursor := p_start_min;
  for step in select * from service_steps where service_id = p_service_id order by step_order loop
    insert into appointment_steps
      (appointment_id, step_order, name, date, start_min, end_min,
       uses_staff, staff_id, equipment_id, service_id, headcount)
    values
      (p_appointment_id, step.step_order, step.name, p_date, v_cursor, v_cursor + step.duration_min,
       step.uses_staff,
       case when step.uses_staff then p_staff_id else null end,
       step.equipment_id, p_service_id, step.headcount);
    v_cursor := v_cursor + step.duration_min;
  end loop;

  return jsonb_build_object('ok', true);
end; $$;
