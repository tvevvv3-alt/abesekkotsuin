-- 臨時の予約可能枠（昼休みなど、その日だけ担当者ごとに開放）
-- Supabase の SQL Editor でこの内容をまるごと実行してください（1回でOK・再実行しても安全）。

-- 1) テーブル
create table if not exists public.openings (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  staff_id   uuid references public.staff(id) on delete cascade,
  start_min  int not null,
  end_min    int not null,
  created_at timestamptz not null default now()
);
create index if not exists openings_date_idx on public.openings (date);

-- 2) RLS（患者カレンダーは閲覧のみ、管理は認証済みスタッフが全操作）
alter table public.openings enable row level security;
drop policy if exists openings_public_read on public.openings;
create policy openings_public_read on public.openings for select using (true);
drop policy if exists openings_staff_all on public.openings;
create policy openings_staff_all on public.openings for all to authenticated using (true) with check (true);

-- 3) 予約可否判定に「臨時開放枠」を反映（通常施術の勤務時間チェックに OR で追加）
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
    select count(*) into v_used
      from appointments ap
     where ap.service_id = p_service_id and ap.status = 'booked'
       and ap.date = p_date
       and ap.start_min < v_end and ap.end_min > p_start_min
       and (p_exclude_appointment_id is null or ap.id != p_exclude_appointment_id);
    if v_used >= v_capacity then
      return jsonb_build_object('ok', false, 'reason', '満', 'used', v_used, 'capacity', v_capacity);
    end if;
    return jsonb_build_object('ok', true, 'end_min', v_end, 'used', v_used, 'capacity', v_capacity);
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
        join appointments ap on ap.id = a.appointment_id and ap.status = 'booked'
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
      join appointments ap on ap.id = a.appointment_id and ap.status = 'booked'
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
