-- =====================================================================
--  阿部接骨院 予約システム  スキーマ定義
--  Supabase SQL Editor に貼り付けて実行してください。
--
--  設計方針
--  ・予約は「時間枠」ではなく「工程(Step)」単位で管理する。
--  ・担当者の空きと機器の空きを "別々に" 判定し、組み合わせて可否を出す。
--  ・patients / staff は電子カルテ(emr)と共有できるよう互換定義。
--    - emr と同じ DB で実行する場合、既存の patients/staff はそのまま使われ、
--      予約に必要な列だけ追加されます（if not exists / add column if not exists）。
--    - 予約単体の新規 DB で実行する場合、必要な表を新規作成します。
-- =====================================================================

-- ---------- 拡張 -----------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid

-- =====================================================================
--  患者・スタッフ（emr と共有。無ければ作成）
-- =====================================================================

-- emr の staff は auth.users を参照しますが、予約で「施術対象」となる担当者は
-- 必ずしもログインユーザーとは限りません。新規 DB ではログイン不要の行として
-- 作成できるよう、FK なしで定義します（emr 既存 DB では既存定義が優先されます）。
create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text not null default 'therapist',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 予約用の付加情報（担当者カラー・並び順・受付可否・表示制御・在籍状態 など）
alter table public.staff add column if not exists color          text;
alter table public.staff add column if not exists sort_order     int  not null default 0;
alter table public.staff add column if not exists bookable       boolean not null default true; -- 予約受付ON/OFF
alter table public.staff add column if not exists name_kana      text;
alter table public.staff add column if not exists display_name   text;   -- 表示名（患者向け）
alter table public.staff add column if not exists patient_visible boolean not null default true; -- 患者画面表示
alter table public.staff add column if not exists admin_visible  boolean not null default true;  -- 管理画面表示
-- 在籍状態：active(在籍中) / paused(休止中) / retired(退職) / hidden(非表示)
alter table public.staff add column if not exists status         text not null default 'active';
alter table public.staff add column if not exists bio            text;   -- 紹介文
alter table public.staff add column if not exists image_path     text;   -- プロフィール画像
alter table public.staff add column if not exists clinic         text;   -- 所属院
alter table public.staff add column if not exists note           text;   -- 備考

create table if not exists public.patients (
  id                uuid primary key default gen_random_uuid(),
  patient_number    text unique not null,
  name              text not null,
  name_kana         text,
  birth_date        date,
  phone             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- 電話番号での再来院者判定に利用
create index if not exists patients_phone_idx on public.patients (phone);

-- =====================================================================
--  機器（equipment）: ハイチャージ 等。同時利用人数を保持。
-- =====================================================================
create table if not exists public.equipment (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,               -- 例: ハイチャージ
  capacity   int  not null default 1,     -- 同時利用可能人数（ハイチャージ=4）
  active     boolean not null default true,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.equipment add column if not exists visible boolean not null default true; -- 表示ON/OFF
alter table public.equipment add column if not exists note    text;                          -- 備考

-- =====================================================================
--  メニュー（services）: 施術30分 / 全身通電30分→施術30分 など
-- =====================================================================
create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  active      boolean not null default true,
  recommended boolean not null default false, -- イチオシ表示
  -- 定員（1=通常メニュー / 2以上=定員制クラス。体幹教室=4）
  -- capacity>1 のメニューは担当者に紐づかず、同時刻の予約人数で判定・表示する。
  capacity    int  not null default 1,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
-- 既存インストール向け（過去に schema.sql を実行済みの場合）
alter table public.services add column if not exists recommended boolean not null default false;
alter table public.services add column if not exists capacity int not null default 1;
alter table public.services add column if not exists category      text not null default '施術メニュー'; -- 施術メニュー/体幹教室/川西整体院/その他
alter table public.services add column if not exists patient_name  text;    -- 患者向け表示名（未設定なら name）
alter table public.services add column if not exists published     boolean not null default true; -- 公開/非公開
alter table public.services add column if not exists new_booking   boolean not null default true; -- 新規受付ON/OFF（体幹教室の新規停止など）
alter table public.services add column if not exists image_path    text;    -- メニュー画像
alter table public.services add column if not exists note          text;
-- 定員制クラス等で開始時刻を固定する場合の候補（"分"のカンマ区切り。例 体幹=1020,1080,1170）
-- 空なら受付時間内の30分刻みすべてを候補にする。曜日ごとの回数変更は休診設定で調整。
alter table public.services add column if not exists class_starts  text;

-- =====================================================================
--  工程テンプレート（service_steps）: メニューを構成する工程
--    ・担当者使用の有無 / 使用機器 / 所要時間 / 順番 / 同時利用人数
-- =====================================================================
create table if not exists public.service_steps (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services(id) on delete cascade,
  step_order    int  not null,                 -- 1,2,3...
  name          text not null,                 -- 例: 全身通電, 施術
  duration_min  int  not null,                 -- 所要時間（分, 5分単位）
  uses_staff    boolean not null default false,-- 担当者を拘束するか
  equipment_id  uuid references public.equipment(id) on delete set null,
  headcount     int  not null default 1,       -- この工程が機器を占有する人数
  created_at    timestamptz not null default now(),
  unique (service_id, step_order)
);
create index if not exists service_steps_service_idx on public.service_steps (service_id, step_order);
-- 工程を患者画面に表示するか（既定は非表示：患者にはメニュー名・説明のみ）
alter table public.service_steps add column if not exists patient_visible boolean not null default false;

-- =====================================================================
--  スタッフ×メニュー 対応表（staff_services）
--    どちらの画面（スタッフ側/メニュー側）から編集しても同じデータに反映。
--    患者はメニュー選択後、対応可能なスタッフのみ表示する。
-- =====================================================================
create table if not exists public.staff_services (
  staff_id   uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);
create index if not exists staff_services_service_idx on public.staff_services (service_id);

-- =====================================================================
--  料金（service_prices）: スタッフ別・初診/再診。コードに固定せずDB管理。
-- =====================================================================
create table if not exists public.service_prices (
  service_id    uuid not null references public.services(id) on delete cascade,
  staff_id      uuid not null references public.staff(id) on delete cascade,
  initial_price int,  -- 初診（円）
  repeat_price  int,  -- 再診（円）
  primary key (service_id, staff_id)
);

-- =====================================================================
--  予約 基本設定（settings）: 院全体の1行設定。
-- =====================================================================
create table if not exists public.settings (
  id                    int primary key default 1,
  slot_unit             int  not null default 30,   -- 予約開始時刻の単位（15/30分）
  same_day_ok           boolean not null default true, -- 当日予約の可否
  last_accept_min       int,                         -- 患者が予約できる最終時刻（分, null=営業終了まで）
  cancel_deadline_hours int  not null default 0,     -- キャンセル受付期限（何時間前まで）
  change_deadline_hours int  not null default 0,     -- 予約変更受付期限
  autofill              boolean not null default true, -- 患者情報の自動入力
  recheck_on_book       boolean not null default true, -- 予約確定時の空き再確認（常に有効）
  updated_at            timestamptz not null default now(),
  check (id = 1)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- =====================================================================
--  予約公開設定（booking_windows）: 月ごとの公開スケジュール。
--    公開前は患者に予約枠を出さず「◯月分は◯日◯時から受付開始」と表示。
-- =====================================================================
create table if not exists public.booking_windows (
  year_month text primary key,          -- 'YYYY-MM'
  open_at    timestamptz,               -- 公開日時（この時刻以降に公開）
  accept_from date,                     -- 予約受付開始日
  accept_to   date,                     -- 予約受付終了日
  published  boolean not null default false, -- 今すぐ公開(true)/一時非公開(false)の手動指定
  note       text,
  updated_at timestamptz not null default now()
);

-- =====================================================================
--  営業時間の基本形（business_hours）: 曜日ごと・午前/午後の最大2枠
--    スタッフの勤務時間へ「一括反映」するためのテンプレート。
--    時刻は「0時からの分」で保持（内部5分単位）
-- =====================================================================
create table if not exists public.business_hours (
  weekday    smallint primary key check (weekday between 0 and 6),
  is_open    boolean not null default true,
  seg1_start int,   -- 午前枠 開始（例: 10:00 → 600）
  seg1_end   int,   -- 午前枠 終了（例: 13:00 → 780）
  seg2_start int,   -- 午後枠 開始（例: 16:00 → 960）
  seg2_end   int    -- 午後枠 終了（例: 20:30 → 1230）
);

-- =====================================================================
--  勤務時間（staff_schedules）: 曜日ごとの勤務時間帯
--    weekday: 0=日 1=月 ... 6=土（Postgres の dow と同じ）
--    時刻は「0時からの分」で保持（内部5分単位）
-- =====================================================================
create table if not exists public.staff_schedules (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_min  int not null,   -- 例: 09:00 → 540
  end_min    int not null,   -- 例: 19:30 → 1170
  created_at timestamptz not null default now(),
  check (start_min < end_min)
);
create index if not exists staff_schedules_staff_idx on public.staff_schedules (staff_id, weekday);

-- =====================================================================
--  休診（closures）: 全体休診 or 担当者個別休。終日 or 時間帯。
--    staff_id NULL = 院全体の休診
--    start_min/end_min NULL = 終日
-- =====================================================================
create table if not exists public.closures (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  staff_id   uuid references public.staff(id) on delete cascade,  -- NULL=全体
  start_min  int,   -- NULL=終日
  end_min    int,
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists closures_date_idx on public.closures (date);
-- 特定メニュー（体幹教室など）だけの休み。NULL=メニュー限定でない
alter table public.closures add column if not exists service_id uuid references public.services(id) on delete cascade;

-- =====================================================================
--  予約（appointments）: 患者から見た1件の予約
--    date + start_min（来院時刻）を保持。工程の実体は appointment_steps。
-- =====================================================================
create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid references public.patients(id) on delete set null,
  service_id   uuid references public.services(id) on delete set null,
  staff_id     uuid references public.staff(id) on delete set null,
  date         date not null,
  start_min    int  not null,          -- 来院時刻（分）
  end_min      int  not null,          -- 最終工程の終了（分）
  status       text not null default 'booked', -- booked / cancelled / done
  source       text not null default 'patient',-- patient / admin
  note         text,
  -- 表示用キャッシュ（一覧の高速表示・emr未連携時のフォールバック）
  patient_name text,
  service_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists appointments_date_idx on public.appointments (date, staff_id);
create index if not exists appointments_patient_idx on public.appointments (patient_id);

-- =====================================================================
--  工程の実体（appointment_steps）: 予約可否判定の中核データ
--    ・開始/終了時間・担当者使用・使用機器・利用人数 を保存
--    ・担当者を使う工程のみ staff_id を持つ（=担当者の占有）
--    ・機器を使う工程のみ equipment_id を持つ（=機器の占有）
--    → 担当者の空き / 機器の空き を "別々に" 集計できる
-- =====================================================================
create table if not exists public.appointment_steps (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  step_order     int  not null,
  name           text not null,
  date           date not null,           -- 検索用（appointment.date と同じ）
  start_min      int  not null,
  end_min        int  not null,
  uses_staff     boolean not null default false,
  staff_id       uuid references public.staff(id) on delete set null, -- uses_staff時のみ
  equipment_id   uuid references public.equipment(id) on delete set null, -- 機器工程のみ
  service_id     uuid references public.services(id) on delete set null, -- 定員制クラスの人数集計用
  headcount      int  not null default 1,
  created_at     timestamptz not null default now()
);
-- 既存インストール向け
alter table public.appointment_steps add column if not exists service_id uuid references public.services(id) on delete set null;
-- 担当者占有の検索（date + staff）
create index if not exists appt_steps_staff_idx
  on public.appointment_steps (date, staff_id) where uses_staff;
-- 機器占有の検索（date + equipment）
create index if not exists appt_steps_equip_idx
  on public.appointment_steps (date, equipment_id) where equipment_id is not null;
-- 定員制クラスの人数集計（date + service）
create index if not exists appt_steps_service_idx
  on public.appointment_steps (date, service_id) where service_id is not null;

-- updated_at 自動更新
create or replace function public.booking_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists appointments_touch on public.appointments;
create trigger appointments_touch before update on public.appointments
  for each row execute function public.booking_touch_updated_at();

drop trigger if exists patients_booking_touch on public.patients;
create trigger patients_booking_touch before update on public.patients
  for each row execute function public.booking_touch_updated_at();

-- =====================================================================
--  ★ 予約可否判定（工程単位）  check_booking_availability
--    与えられた メニュー・担当者・日付・来院時刻 に対し、
--    ①担当者の空き ②機器の空き ③勤務時間内 ④非休診 ⑤重複なし
--    を工程ごとに判定し、可否と理由を返す。
--    exclude_appointment_id: 予約変更時に自分自身を除外する。
-- =====================================================================
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
begin
  -- メニューに工程が無ければ不可
  if not exists (select 1 from service_steps where service_id = p_service_id) then
    return jsonb_build_object('ok', false, 'reason', 'メニューに工程がありません');
  end if;

  -- 全工程の終了時刻を先に算出
  select p_start_min + coalesce(sum(duration_min), 0)
    into v_end
    from service_steps where service_id = p_service_id;

  select capacity into v_capacity from services where id = p_service_id;

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
  select exists (
    select 1 from staff_schedules
     where staff_id = p_staff_id and weekday = v_dow
       and start_min <= p_start_min and end_min >= v_end
  ) into v_ok;
  if not v_ok then
    return jsonb_build_object('ok', false, 'reason', '勤務時間外');
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

-- =====================================================================
--  ★ 予約確定（book_appointment）
--    二重予約防止：同日について advisory lock を取得し、確定直前に
--    check_booking_availability を再判定してから登録する（原子的）。
--    患者は電話番号で名寄せ（再来院者は既存レコードを再利用）。
-- =====================================================================
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

  -- 予約本体
  insert into appointments
    (patient_id, service_id, staff_id, date, start_min, end_min, status, source, note,
     patient_name, service_name)
  values
    (v_patient, p_service_id, p_staff_id, p_date, p_start_min, v_end, 'booked', p_source, p_note,
     p_name, v_svc_name)
  returning id into v_appt;

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

-- =====================================================================
--  ★ 予約変更（reschedule_appointment）
--    メニュー/担当者/日時を変更。自分自身を除外して再判定→工程を作り直す。
-- =====================================================================
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

  v_check := check_booking_availability(p_service_id, p_staff_id, p_date, p_start_min, p_appointment_id);
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

-- =====================================================================
--  RLS
--   ・患者予約画面は匿名(anon)。可否判定に必要な "設定/占有" のみ閲覧可。
--   ・患者個人情報(patients) と 予約本体(appointments) は匿名では読めない。
--   ・登録は SECURITY DEFINER の RPC 経由のみ（RLSを迂回して原子的に実施）。
--   ・管理画面は認証済みスタッフ(authenticated)が全操作可。
-- =====================================================================
alter table public.staff             enable row level security;
alter table public.patients          enable row level security;
alter table public.equipment         enable row level security;
alter table public.services          enable row level security;
alter table public.service_steps     enable row level security;
alter table public.staff_services    enable row level security;
alter table public.service_prices    enable row level security;
alter table public.settings          enable row level security;
alter table public.booking_windows   enable row level security;
alter table public.business_hours    enable row level security;
alter table public.staff_schedules   enable row level security;
alter table public.closures          enable row level security;
alter table public.appointments      enable row level security;
alter table public.appointment_steps enable row level security;

-- 匿名でも読める設定系（カレンダー描画に必要）
drop policy if exists staff_public_read on public.staff;
create policy staff_public_read on public.staff for select
  using (true);
drop policy if exists equipment_public_read on public.equipment;
create policy equipment_public_read on public.equipment for select using (true);
drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services for select using (true);
drop policy if exists service_steps_public_read on public.service_steps;
create policy service_steps_public_read on public.service_steps for select using (true);
drop policy if exists staff_services_public_read on public.staff_services;
create policy staff_services_public_read on public.staff_services for select using (true);
drop policy if exists service_prices_public_read on public.service_prices;
create policy service_prices_public_read on public.service_prices for select using (true);
drop policy if exists settings_public_read on public.settings;
create policy settings_public_read on public.settings for select using (true);
drop policy if exists booking_windows_public_read on public.booking_windows;
create policy booking_windows_public_read on public.booking_windows for select using (true);
drop policy if exists business_hours_public_read on public.business_hours;
create policy business_hours_public_read on public.business_hours for select using (true);
drop policy if exists schedules_public_read on public.staff_schedules;
create policy schedules_public_read on public.staff_schedules for select using (true);
drop policy if exists closures_public_read on public.closures;
create policy closures_public_read on public.closures for select using (true);

-- 占有情報のみ匿名可（患者名などは appointment_steps に含めない）
drop policy if exists appt_steps_public_read on public.appointment_steps;
create policy appt_steps_public_read on public.appointment_steps for select using (true);

-- 認証済みスタッフは全設定・全予約を操作可能
--  ※ emr と同じ DB では is_active_staff() が使えるが、予約単体 DB でも動くよう
--    authenticated ロールに広めの権限を付与する。
do $$
declare t text;
begin
  foreach t in array array[
    'staff','patients','equipment','services','service_steps','staff_services','service_prices',
    'settings','booking_windows','business_hours','staff_schedules','closures','appointments','appointment_steps'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_staff_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t||'_staff_all', t);
  end loop;
end $$;

-- 匿名クライアントに予約 RPC の実行権限を付与
grant execute on function public.check_booking_availability(uuid, uuid, date, int, uuid) to anon, authenticated;
grant execute on function public.book_appointment(uuid, uuid, date, int, text, text, date, text, text, text) to anon, authenticated;
grant execute on function public.reschedule_appointment(uuid, uuid, uuid, date, int, text) to authenticated;

-- =====================================================================
--  初期セットアップメモ
--  1) この schema.sql を実行
--  2) seed.sql を実行（担当者4名・メニュー・機器・勤務時間のサンプル投入）
--  3) 管理画面ログイン用に Authentication → Users でスタッフを作成
--     （予約単体運用の場合。emr と共有なら emr のログインを使用）
-- =====================================================================
