-- 川西を毎正時のみ受付＋時間外/川西を営業日のみ(通常と同じ休診曜日)に

update public.services set after_hours = true, class_starts = '600,660,720,960,1020,1080,1140,1200' where name = '川西整体院';

create or replace function public.check_booking_availability(
  p_service_id uuid,
  p_staff_id   uuid,
  p_date       date,
  p_start_min  int,
  p_exclude_appointment_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_dow    int := extract(dow from p_date);   -- 0=日..6=土
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
  -- メニューに工程が無ければ不可
  if not exists (select 1 from service_steps where service_id = p_service_id) then
    return jsonb_build_object('ok', false, 'reason', 'メニューに工程がありません');
  end if;

  -- 全工程の終了時刻を先に算出
  select p_start_min + coalesce(sum(duration_min), 0)
    into v_end
    from service_steps where service_id = p_service_id;

  select capacity, coalesce(after_hours, false)
    into v_capacity, v_after_hours
    from services where id = p_service_id;

  -- ★ 定員制クラス（体幹教室など capacity>1）
  --   担当者に紐づかず、同時刻の「同一メニュー予約人数」で判定する。
  if coalesce(v_capacity, 1) > 1 then
    -- 営業時間（いずれかの担当者が勤務している時間帯に収まること）
    if not exists (
      select 1 from staff_schedules
       where weekday = v_dow and start_min <= p_start_min and end_min >= v_end
    ) then
      return jsonb_build_object('ok', false, 'reason', '営業時間外');
    end if;
    -- 院全体休診 or このメニュー限定の休み（個々の担当者の休みはクラスに影響しない）
    if exists (
      select 1 from closures c
       where c.date = p_date
         and ((c.staff_id is null and c.service_id is null) or c.service_id = p_service_id)
         and (c.start_min is null or (c.start_min < v_end and c.end_min > p_start_min))
    ) then
      return jsonb_build_object('ok', false, 'reason', '休診');
    end if;
    -- 同時刻の予約人数（=定員に対する充足）
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

  -- ③ 勤務時間内（予約全体が担当者の勤務時間に収まること）
  --    時間外予約/別院(after_hours)は時間帯には縛られないが、
  --    「その曜日が営業日（担当者の勤務がある日）」であることは必要＝通常と同じ休診曜日。
  if v_after_hours then
    if not exists (
      select 1 from staff_schedules where staff_id = p_staff_id and weekday = v_dow
    ) then
      return jsonb_build_object('ok', false, 'reason', '休診');
    end if;
  else
    select exists (
      select 1 from staff_schedules
       where staff_id = p_staff_id and weekday = v_dow
         and start_min <= p_start_min and end_min >= v_end
    ) into v_ok;
    if not v_ok then
      return jsonb_build_object('ok', false, 'reason', '勤務時間外');
    end if;
  end if;

  -- ④ 休診でない（院全体休診 / 当該担当者の休み。終日 or 時間帯）
  --    メニュー限定の休み(service_id有り)は通常施術には影響しない
  if exists (
    select 1 from closures c
     where c.date = p_date
       and c.service_id is null
       and (c.staff_id is null or c.staff_id = p_staff_id)
       and (
         (c.start_min is null)                       -- 終日
         or (c.start_min < v_end and c.end_min > p_start_min) -- 時間帯が重なる
       )
  ) then
    return jsonb_build_object('ok', false, 'reason', '休診');
  end if;

  -- 工程を順に展開し、担当者/機器の空きを別々に判定
  for step in
    select * from service_steps where service_id = p_service_id order by step_order
  loop
    s_start := v_cursor;
    s_end   := v_cursor + step.duration_min;

    -- ① 担当者を使う工程：担当者が空いていること（重複=不可）
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

    -- ② 機器を使う工程：同時利用人数が定員未満であること
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
