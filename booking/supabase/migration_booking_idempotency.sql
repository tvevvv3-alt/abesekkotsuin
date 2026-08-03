-- =====================================================================
--  WEB予約の二重送信・重複予約を「技術的に」防ぐためのマイグレーション
--
--  1) appointments に idempotency_key（冪等キー）列を追加＋ユニーク制約
--     - 予約フォーム1回分につき1つのUUID。ボタン連打／戻る→再送信でも
--       同じキーで来れば新規作成せず既存予約を返す（= 重複0件）。
--  2) book_appointment を冪等対応に差し替え。
--
--  ★「担当者×日付×開始時刻」のユニーク制約は入れません。
--    当院では同じ担当者が同時刻に複数人を進行するケース（例：1人を全身通電の
--    機械にかけている間にもう1人を手技）が正常運用として存在するため、
--    そこにユニークを貼ると正常な同時予約が弾かれます。実際の空き判定は
--    check_booking_availability（機械の台数・工程の重なり）＋ advisory lock が
--    担っており、二重送信は下記の冪等キーで防ぎます。
-- =====================================================================

-- ---- 1) 冪等キー列＋ユニーク ------------------------------------------
alter table public.appointments
  add column if not exists idempotency_key uuid;

create unique index if not exists appointments_idempotency_key_uidx
  on public.appointments (idempotency_key)
  where idempotency_key is not null;

-- ---- 2) book_appointment を冪等対応に差し替え -------------------------
--  旧シグネチャを破棄してから作り直す（引数追加のため）。
drop function if exists public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text);

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

  -- 確定直前の再判定
  v_check := check_booking_availability(p_service_id, p_staff_id, p_date, p_start_min, null);
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_check->>'reason', '予約不可'));
  end if;
  v_end := (v_check->>'end_min')::int;

  -- 患者の名寄せ（電話番号優先）
  if p_phone is not null and length(trim(p_phone)) > 0 then
    select id into v_patient from patients where phone = p_phone order by created_at limit 1;
  end if;

  if v_patient is null then
    -- 患者番号を採番（B + 通し番号）
    select 'B' || lpad((count(*) + 1)::text, 5, '0') into v_num from patients;
    insert into patients (patient_number, name, name_kana, birth_date, phone)
    values (v_num, p_name, p_name_kana, p_birth_date, p_phone)
    returning id into v_patient;
  else
    -- 既存患者は最新情報で軽く更新（空欄は上書きしない）
    update patients set
      name = coalesce(nullif(trim(p_name), ''), name),
      name_kana = coalesce(nullif(trim(p_name_kana), ''), name_kana),
      birth_date = coalesce(p_birth_date, birth_date)
    where id = v_patient;
  end if;

  select name into v_svc_name from services where id = p_service_id;

  -- 予約本体（ユニーク制約に当たった場合はキー競合／枠競合として扱う）
  begin
    insert into appointments
      (patient_id, service_id, staff_id, date, start_min, end_min, status, source, note,
       patient_name, service_name, idempotency_key)
    values
      (v_patient, p_service_id, p_staff_id, p_date, p_start_min, v_end, 'booked', p_source, p_note,
       p_name, v_svc_name, p_idempotency_key)
    returning id into v_appt;
  exception when unique_violation then
    -- 冪等キーの競合：ほぼ同時の再送信 → 既存予約を成功として返す
    if p_idempotency_key is not null then
      select id into v_existing from appointments where idempotency_key = p_idempotency_key limit 1;
      if v_existing is not null then
        return jsonb_build_object('ok', true, 'appointment_id', v_existing, 'duplicate', true);
      end if;
    end if;
    -- それ以外＝同じ枠を他の人が先に取った
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

grant execute on function public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text, uuid) to anon, authenticated;
