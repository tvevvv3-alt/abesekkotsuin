-- 親子・兄弟（同じ電話番号で別の氏名）を別患者として扱う修正。
-- これまでは電話番号だけで患者を照合していたため、同じ電話の家族が
-- 1人の患者にまとめられ、氏名も上書きされていた。
-- 氏名（スペース差は無視）も一致する場合だけ同一人物とみなす。
-- Supabase の SQL Editor で1回実行（再実行しても安全）。

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
  p_source     text default 'patient',
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_check    jsonb;
  v_patient  uuid;
  v_appt     uuid;
  v_existing uuid;
  v_end      int;
  v_cursor   int;
  v_num      text;
  v_svc_name text;
  v_admin    boolean := (p_source = 'admin');
  step       record;
begin
  if p_idempotency_key is not null then
    select id into v_existing from appointments where idempotency_key = p_idempotency_key limit 1;
    if v_existing is not null then
      return jsonb_build_object('ok', true, 'appointment_id', v_existing, 'duplicate', true);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_date::text, 0));

  v_check := check_booking_availability(
    p_service_id, p_staff_id, p_date, p_start_min, null, v_admin, v_admin
  );
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_check->>'reason', '予約不可'));
  end if;
  v_end := (v_check->>'end_min')::int;

  -- 同じ電話番号でも「氏名が同じ」患者だけを同一人物とみなす（親子・兄弟は別患者に分ける）。
  -- 氏名はスペース差（半角/全角）を無視して比較する。
  if p_phone is not null and length(trim(p_phone)) > 0 then
    select id into v_patient from patients
     where phone = p_phone
       and regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g')
         = regexp_replace(coalesce(p_name, ''), '[[:space:]　]', '', 'g')
     order by created_at limit 1;
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

  begin
    insert into appointments
      (patient_id, service_id, staff_id, date, start_min, end_min, status, source, note,
       patient_name, service_name, idempotency_key)
    values
      (v_patient, p_service_id, p_staff_id, p_date, p_start_min, v_end, 'booked', p_source, p_note,
       p_name, v_svc_name, p_idempotency_key)
    returning id into v_appt;
  exception when unique_violation then
    if p_idempotency_key is not null then
      select id into v_existing from appointments where idempotency_key = p_idempotency_key limit 1;
      if v_existing is not null then
        return jsonb_build_object('ok', true, 'appointment_id', v_existing, 'duplicate', true);
      end if;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end;

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

grant execute on function public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text, uuid) to anon, authenticated;
