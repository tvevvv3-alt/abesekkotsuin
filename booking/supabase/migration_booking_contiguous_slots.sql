-- =====================================================================
--  予約可否判定：隣接する勤務/開放枠をまたぐメニューを予約可にする
--
--  これまで「予約全体が“1つの”勤務枠 or “1つの”開放枠に収まること」を
--  要求していたため、30分刻みで個別に開けた開放枠では 60分メニュー等が
--  「勤務時間外」で確定できなかった（◯表示なのに予約完了できない）。
--
--  covers_span_staff() を追加し、staff_schedules（その曜日）＋openings（その日）
--  の“連続した”範囲で予約全体が覆われていれば予約可とする。
--  間に本当の空き（勤務していない時間）がある場合は従来どおり不可。
--
--  ※ check_booking_availability は migration_room_exclusion.sql の内容を基に、
--    通常メニューの「③勤務時間内」判定だけを covers_span_staff に差し替え。
-- =====================================================================

-- ---- 連続枠カバレッジ判定 --------------------------------------------
create or replace function public.covers_span_staff(
  p_staff_id uuid,
  p_dow      int,
  p_date     date,
  p_start    int,
  p_end      int
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_cur int := p_start;
  seg   record;
begin
  if p_start >= p_end then
    return true;
  end if;
  for seg in
    select s, e from (
      select start_min as s, end_min as e
        from staff_schedules
       where staff_id = p_staff_id and weekday = p_dow
      union all
      select start_min as s, end_min as e
        from openings
       where staff_id = p_staff_id and date = p_date
    ) q
    where e > s
    order by s
  loop
    if seg.s > v_cur then
      exit; -- v_cur の前に空き（ギャップ）がある → 覆えていない
    end if;
    if seg.e > v_cur then
      v_cur := seg.e; -- 連続（隣接・重なり）している枠で伸ばす
    end if;
    if v_cur >= p_end then
      return true;
    end if;
  end loop;
  return v_cur >= p_end;
end; $$;

grant execute on function public.covers_span_staff(uuid, int, date, int, int) to anon, authenticated;

-- ---- check_booking_availability を差し替え ---------------------------
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
  if v_opening_only then
    if not p_ignore_hours and not exists (
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
  --    ★ 変更点：単一枠ではなく「連続した」勤務/開放枠で覆われていればOK。
  if not p_ignore_hours then
    if v_after_hours then
      if not exists (
        select 1 from staff_schedules where staff_id = p_staff_id and weekday = v_dow
      ) then
        return jsonb_build_object('ok', false, 'reason', '休診');
      end if;
    else
      if not covers_span_staff(p_staff_id, v_dow, p_date, p_start_min, v_end) then
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

notify pgrst, 'reload schema';
