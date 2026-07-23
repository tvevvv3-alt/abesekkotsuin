-- 管理画面からの予約は「休診（枠の確保）」を無視して入れられるようにする。
-- 休診＝患者向けに枠を止める／電話予約用に枠を確保するもの。
-- 管理者はその確保枠に実際の予約（全身通電など複数工程）を入れられる必要がある。
-- Supabase の SQL Editor で1回実行（再実行しても安全）。

-- 旧5引数版を破棄（6引数＋既定値と衝突するため）
drop function if exists public.check_booking_availability(uuid, uuid, date, int, uuid);

-- ★ 予約可否判定（p_ignore_closures=true で休診チェックを飛ばす）
create or replace function public.check_booking_availability(
  p_service_id uuid,
  p_staff_id   uuid,
  p_date       date,
  p_start_min  int,
  p_exclude_appointment_id uuid default null,
  p_ignore_closures boolean default false
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
begin
  if not exists (select 1 from service_steps where service_id = p_service_id) then
    return jsonb_build_object('ok', false, 'reason', 'メニューに工程がありません');
  end if;

  select p_start_min + coalesce(sum(duration_min), 0)
    into v_end
    from service_steps where service_id = p_service_id;

  select capacity, coalesce(after_hours, false)
    into v_capacity, v_after_hours
    from services where id = p_service_id;

  -- ★ 定員制クラス
  if coalesce(v_capacity, 1) > 1 then
    if not exists (
      select 1 from staff_schedules
       where weekday = v_dow and start_min <= p_start_min and end_min >= v_end
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
    select count(*) into v_used
      from appointments ap
     where ap.service_id = p_service_id and ap.status = 'booked'
       and ap.date = p_date
       and ap.start_min < v_end and ap.end_min > p_start_min
       and (p_exclude_appointment_id is null or ap.id <> p_exclude_appointment_id);
    if v_used >= v_capacity then
      return jsonb_build_object('ok', false, 'reason', '満', 'used', v_used, 'capacity', v_capacity);
    end if;
    return jsonb_build_object('ok', true, 'end_min', v_end, 'used', v_used, 'capacity', v_capacity);
  end if;

  -- ③ 勤務時間内
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

  -- ④ 休診でない（管理者予約=p_ignore_closures のときは飛ばす）
  if not p_ignore_closures and exists (
    select 1 from closures c
     where c.date = p_date
       and c.service_id is null
       and (c.staff_id is null or c.staff_id = p_staff_id)
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
      if exists (
        select 1 from appointment_steps a
        join appointments ap on ap.id = a.appointment_id and ap.status = 'booked'
        where a.uses_staff
          and a.staff_id = p_staff_id
          and a.date = p_date
          and a.start_min < s_end and a.end_min > s_start
          and (p_exclude_appointment_id is null or a.appointment_id <> p_exclude_appointment_id)
      ) then
        return jsonb_build_object('ok', false, 'reason', '担当者の空きなし', 'step', step.name);
      end if;
    end if;

    if step.equipment_id is not null then
      select coalesce(sum(a.headcount), 0) into v_used
      from appointment_steps a
      join appointments ap on ap.id = a.appointment_id and ap.status = 'booked'
      where a.equipment_id = step.equipment_id
        and a.date = p_date
        and a.start_min < s_end and a.end_min > s_start
        and (p_exclude_appointment_id is null or a.appointment_id <> p_exclude_appointment_id);
      select capacity into v_cap from equipment where id = step.equipment_id;
      if v_used + step.headcount > coalesce(v_cap, 1) then
        return jsonb_build_object('ok', false, 'reason', '機器の空きなし', 'step', step.name);
      end if;
    end if;

    v_cursor := s_end;
  end loop;

  return jsonb_build_object('ok', true, 'end_min', v_end);
end; $$;

grant execute on function public.check_booking_availability(uuid, uuid, date, int, uuid, boolean) to anon, authenticated;

-- ★ 予約確定：source='admin' のときは休診を無視
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
  step       record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_date::text, 0));

  v_check := check_booking_availability(
    p_service_id, p_staff_id, p_date, p_start_min, null, (p_source = 'admin')
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

-- ★ 予約変更：管理からのみ呼ばれるため常に休診を無視
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
    p_service_id, p_staff_id, p_date, p_start_min, p_appointment_id, true
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
