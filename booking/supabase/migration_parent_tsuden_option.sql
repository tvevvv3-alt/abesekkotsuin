-- =====================================================================
--  学生のお子さまの保護者限定「全身通電20分」オプション（+1,500円）を
--  全身通電の機器枠（同時3名）にカウントする。
--
--  book_appointment に p_parent_tsuden を追加。true のとき:
--   ・全身通電(equipment.name='全身通電')の空きを [start, start+20] で確認し、
--     満員なら予約を作らず reason='denden_full' を返す。
--   ・空いていれば予約確定後に、全身通電を20分占有する appointment_steps を1行追加。
--  これにより、保護者オプションも通電の同時利用枠(3名)にカウントされ、
--  カレンダー・個別売上・通電メニューの空き判定に反映される。
--
--  ※直前の版（p_after_hours 追加版）をそのまま踏襲し、p_parent_tsuden を末尾に追加。
--  Supabase の SQL Editor で1回実行（再実行しても安全）。
-- =====================================================================

drop function if exists public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text, uuid, boolean);

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
  p_after_hours boolean default false,
  p_parent_tsuden boolean default false
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
  v_eq_hc    uuid;   -- 全身通電の機器ID
  v_hc_used  int;
  v_hc_cap   int;
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

  -- 保護者・全身通電オプション：全身通電の機器枠(同時3名)の空きを [start, start+20] で確認
  if p_parent_tsuden then
    select id into v_eq_hc from equipment where name = '全身通電' limit 1;
    if v_eq_hc is not null then
      select coalesce(sum(a.headcount), 0) into v_hc_used
      from appointment_steps a
      join appointments ap on ap.id = a.appointment_id and ap.status = 'booked'
      where a.equipment_id = v_eq_hc
        and a.date = p_date
        and a.start_min < p_start_min + 20 and a.end_min > p_start_min;
      select capacity into v_hc_cap from equipment where id = v_eq_hc;
      if v_hc_used + 1 > coalesce(v_hc_cap, 1) then
        return jsonb_build_object('ok', false, 'reason', 'denden_full');
      end if;
    end if;
  end if;

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

  -- 保護者・全身通電オプション：全身通電を20分占有する工程を追加（枠3名にカウント）
  if p_parent_tsuden and v_eq_hc is not null then
    insert into appointment_steps
      (appointment_id, step_order, name, date, start_min, end_min,
       uses_staff, staff_id, equipment_id, service_id, headcount)
    values
      (v_appt, 99, '全身通電(保護者)', p_date, p_start_min, p_start_min + 20,
       false, null, v_eq_hc, p_service_id, 1);
  end if;

  return jsonb_build_object('ok', true, 'appointment_id', v_appt, 'patient_id', v_patient);
end; $$;

grant execute on function public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text, uuid, boolean, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
