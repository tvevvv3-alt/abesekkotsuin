-- トレーニングルーム排他：パーソナルと体幹教室は同じ部屋を使うため相互ブロック。
--   ・パーソナル予約 … 同時刻に「パーソナル or 体幹教室」があれば不可（部屋は同時1枠）
--   ・体幹教室予約  … 同時刻に「パーソナル」があれば不可（体幹が基本なのでパーソナルが入っている枠だけブロック）
-- 部屋を使うメニュー＝ personal=true または capacity>1（体幹教室）。
-- 既存の check_booking_availability に部屋チェックを追加して置き換える。
create or replace function public.check_booking_availability(
  p_service_id uuid,
  p_staff_id   uuid,
  p_date       date,
  p_start_min  int,
  p_exclude_appointment_id uuid default null
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
  v_room    boolean;
begin
  if not exists (select 1 from service_steps where service_id = p_service_id) then
    return jsonb_build_object('ok', false, 'reason', 'メニューに工程がありません');
  end if;

  select p_start_min + coalesce(sum(duration_min), 0)
    into v_end
    from service_steps where service_id = p_service_id;

  select capacity, coalesce(after_hours, false), coalesce(personal, false)
    into v_capacity, v_after_hours, v_personal
    from services where id = p_service_id;

  -- このメニューが部屋（トレーニングルーム）を使うか
  v_room := v_personal or coalesce(v_capacity, 1) > 1;

  -- ===== 定員制クラス（体幹教室など capacity>1）=====
  if coalesce(v_capacity, 1) > 1 then
    if not exists (
      select 1 from staff_schedules
       where weekday = v_dow and start_min <= p_start_min and end_min >= v_end
    ) then
      return jsonb_build_object('ok', false, 'reason', '営業時間外');
    end if;
    if exists (
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

  if exists (
    select 1 from closures c
     where c.date = p_date
       and c.service_id is null
       and (c.staff_id is null or c.staff_id = p_staff_id)
       and ((c.start_min is null) or (c.start_min < v_end and c.end_min > p_start_min))
  ) then
    return jsonb_build_object('ok', false, 'reason', '休診');
  end if;

  for step in
    select * from service_steps where service_id = p_service_id order by step_order
  loop
    s_start := v_cursor;
    s_end   := v_cursor + step.duration_min;

    if step.uses_staff then
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

grant execute on function public.check_booking_availability(uuid, uuid, date, int, uuid) to anon, authenticated;
