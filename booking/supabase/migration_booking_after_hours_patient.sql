-- =====================================================================
--  患者の時間外予約：通常メニューのまま 20:30以降 の枠で予約できるようにする
--
--  これまで時間外予約は「after_hours フラグ付きの専用メニュー」でしか取れず、
--  予約記録もその専用メニューになっていた。
--  患者が最初に選んだ通常メニューのまま時間外枠で予約し、記録もその通常メニューに
--  したいので、book_appointment に p_after_hours を追加。true のときは
--  「勤務時間内チェックのみ」免除する（休診・担当/機器の重複・部屋排他は従来どおり）。
--
--  ※フロント（時間外フロー）が 20:30以降 の固定枠だけを提示するため、
--    任意時刻での悪用は起きない。既存の after_hours メニューの挙動は不変。
-- =====================================================================

drop function if exists public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text, uuid);

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
  p_idempotency_key uuid default null,
  p_after_hours boolean default false
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
  v_admin    boolean := (p_source = 'admin'); -- 管理者は休診＋勤務時間を無視
  step       record;
begin
  -- 冪等性①：同じキーの予約が既にあれば、新規作成せず既存を返す（成功扱い）。
  if p_idempotency_key is not null then
    select id into v_existing from appointments where idempotency_key = p_idempotency_key limit 1;
    if v_existing is not null then
      return jsonb_build_object('ok', true, 'appointment_id', v_existing, 'duplicate', true);
    end if;
  end if;

  -- 同日での同時確定を直列化（二重予約防止の要）
  perform pg_advisory_xact_lock(hashtextextended(p_date::text, 0));

  -- 確定直前の再判定。
  --   p_ignore_closures = v_admin（管理者のみ休診無視）
  --   p_ignore_hours    = v_admin or p_after_hours（管理者＋時間外枠は勤務時間チェックのみ免除）
  v_check := check_booking_availability(
    p_service_id, p_staff_id, p_date, p_start_min, null,
    v_admin, v_admin or p_after_hours
  );
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_check->>'reason', '予約不可'));
  end if;
  v_end := (v_check->>'end_min')::int;

  -- 患者の名寄せ（電話番号優先）
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

  -- 工程の実体を展開して保存
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

grant execute on function public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text, uuid, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
