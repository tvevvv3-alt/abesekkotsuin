-- =====================================================================
--  阿部接骨院 電子カルテ  スキーマ定義
--  Supabase SQL Editor に貼り付けて実行してください。
-- =====================================================================

-- ---------- Enum -----------------------------------------------------
create type staff_role as enum ('director', 'therapist', 'receptionist');
create type sex_type   as enum ('male', 'female', 'other');
create type chart_type as enum ('initial', 'followup');
create type image_type as enum ('echo', 'photo');

-- ---------- staff（スタッフ／プロフィール）--------------------------
-- auth.users と 1:1。ログイン後の権限判定に使用。
create table public.staff (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       staff_role not null default 'therapist',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- patients（患者基本情報）--------------------------------
create table public.patients (
  id                uuid primary key default gen_random_uuid(),
  patient_number    text unique not null,
  name              text not null,
  name_kana         text,
  birth_date        date,
  sex               sex_type,
  phone             text,
  address           text,
  school            text,
  team              text,
  sport             text,
  position          text,
  guardian_name     text,
  guardian_contact  text,
  medical_history   text,
  allergies         text,
  assigned_staff_id uuid references public.staff(id) on delete set null,
  first_visit_date  date,
  created_by        uuid references public.staff(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index patients_name_kana_idx on public.patients (name_kana);
create index patients_name_idx on public.patients (name);

-- ---------- charts（カルテ：初診／再診）----------------------------
-- 可変の臨床項目は data(jsonb) に格納し、拡張しやすくする。
-- treatments には施術チップ選択 { machines:[], methods:[], other:'' } を格納。
create table public.charts (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  chart_type  chart_type not null,
  visit_date  date not null default current_date,
  author_id   uuid references public.staff(id) on delete set null,
  pain_score  smallint check (pain_score between 0 and 10),
  treatments  jsonb not null default '{}'::jsonb,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index charts_patient_idx on public.charts (patient_id, visit_date desc);

-- ---------- images（エコー／患部写真）------------------------------
create table public.images (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  chart_id    uuid references public.charts(id) on delete set null,
  image_type  image_type not null default 'echo',
  storage_path text not null,
  taken_on    date not null default current_date,
  caption     text,
  uploaded_by uuid references public.staff(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index images_patient_idx on public.images (patient_id, taken_on desc);

-- ---------- handovers（申し送り）-----------------------------------
create table public.handovers (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,
  author_id  uuid references public.staff(id) on delete set null,
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);
create index handovers_created_idx on public.handovers (created_at desc);

-- =====================================================================
--  権限判定ヘルパー（RLS再帰を避けるため security definer）
-- =====================================================================
create or replace function public.staff_role(uid uuid)
returns staff_role
language sql stable security definer set search_path = public as $$
  select role from public.staff where id = uid and active = true;
$$;

create or replace function public.is_active_staff(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where id = uid and active = true);
$$;

-- updated_at 自動更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger patients_touch before update on public.patients
  for each row execute function public.touch_updated_at();
create trigger charts_touch before update on public.charts
  for each row execute function public.touch_updated_at();

-- =====================================================================
--  RLS
-- =====================================================================
alter table public.staff     enable row level security;
alter table public.patients  enable row level security;
alter table public.charts    enable row level security;
alter table public.images    enable row level security;
alter table public.handovers enable row level security;

-- ---- staff ---- 全スタッフが氏名等を閲覧可（担当・作成者表示に必要）／管理は院長のみ
create policy staff_select on public.staff for select to authenticated
  using (public.is_active_staff(auth.uid()));
create policy staff_write on public.staff for all to authenticated
  using (public.staff_role(auth.uid()) = 'director')
  with check (public.staff_role(auth.uid()) = 'director');

-- ---- patients ---- 全スタッフ閲覧 / 登録・編集=院長+受付 / 削除=院長
create policy patients_select on public.patients for select to authenticated
  using (public.is_active_staff(auth.uid()));
create policy patients_insert on public.patients for insert to authenticated
  with check (public.staff_role(auth.uid()) in ('director', 'receptionist'));
create policy patients_update on public.patients for update to authenticated
  using (public.staff_role(auth.uid()) in ('director', 'receptionist'))
  with check (public.staff_role(auth.uid()) in ('director', 'receptionist'));
create policy patients_delete on public.patients for delete to authenticated
  using (public.staff_role(auth.uid()) = 'director');

-- ---- charts ---- 閲覧・作成・追記=院長+施術者 / 削除=院長
create policy charts_select on public.charts for select to authenticated
  using (public.staff_role(auth.uid()) in ('director', 'therapist'));
create policy charts_insert on public.charts for insert to authenticated
  with check (public.staff_role(auth.uid()) in ('director', 'therapist'));
create policy charts_update on public.charts for update to authenticated
  using (public.staff_role(auth.uid()) in ('director', 'therapist'))
  with check (public.staff_role(auth.uid()) in ('director', 'therapist'));
create policy charts_delete on public.charts for delete to authenticated
  using (public.staff_role(auth.uid()) = 'director');

-- ---- images ---- カルテと同権限
create policy images_select on public.images for select to authenticated
  using (public.staff_role(auth.uid()) in ('director', 'therapist'));
create policy images_insert on public.images for insert to authenticated
  with check (public.staff_role(auth.uid()) in ('director', 'therapist'));
create policy images_delete on public.images for delete to authenticated
  using (public.staff_role(auth.uid()) = 'director');

-- ---- handovers ---- 全スタッフ閲覧・投稿 / 更新・削除=本人 or 院長
create policy handovers_select on public.handovers for select to authenticated
  using (public.is_active_staff(auth.uid()));
create policy handovers_insert on public.handovers for insert to authenticated
  with check (public.is_active_staff(auth.uid()) and author_id = auth.uid());
create policy handovers_update on public.handovers for update to authenticated
  using (author_id = auth.uid() or public.staff_role(auth.uid()) = 'director');
create policy handovers_delete on public.handovers for delete to authenticated
  using (author_id = auth.uid() or public.staff_role(auth.uid()) = 'director');

-- =====================================================================
--  Storage（エコー画像・患部写真）
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('patient-images', 'patient-images', false)
on conflict (id) do nothing;

create policy "images read" on storage.objects for select to authenticated
  using (bucket_id = 'patient-images'
         and public.staff_role(auth.uid()) in ('director', 'therapist'));
create policy "images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-images'
              and public.staff_role(auth.uid()) in ('director', 'therapist'));
create policy "images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'patient-images'
         and public.staff_role(auth.uid()) = 'director');

-- =====================================================================
--  初期セットアップ用メモ
--  1) Authentication → Users で最初のユーザー(院長)を作成
--  2) 下記でそのユーザーを staff に登録（UUID/氏名を置き換え）
--     insert into public.staff (id, name, role)
--     values ('<auth-user-uuid>', '阿部 院長', 'director');
-- =====================================================================
