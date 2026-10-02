-- 阿部家カレンダー：テーブル定義
-- Supabase の SQL Editor に貼り付けて Run してください（何度実行しても安全です）。
-- 画面からの読み書きはすべてサーバー（service_role キー）経由で行うため、
-- RLS を有効にしてポリシーは作りません＝ブラウザから直接は読めません。

create extension if not exists pgcrypto;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'child' check (role in ('father', 'mother', 'child')),
  birth_date date,
  color text not null default '#64748b',
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  member_ids uuid[] not null default '{}',
  start_time text,          -- 外出 HH:MM
  end_time text,            -- 帰宅 HH:MM
  tentative boolean not null default false,
  away_meals text[] not null default '{}',  -- breakfast / lunch / dinner
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists events_date_idx on events (date);

create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in ('breakfast', 'bento', 'dinner')),
  options jsonb not null default '[]',   -- [{label, title, dishes[], rice, toddler_note}]
  chosen text,                           -- 選んだ label（A/B）
  ratings jsonb not null default '{}',   -- {member_id: ate|some|none}
  created_at timestamptz not null default now(),
  unique (date, slot)
);
create index if not exists meal_plans_date_idx on meal_plans (date);

create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity text,
  category text,
  expires_on date,
  created_at timestamptz not null default now()
);

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity text,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table members enable row level security;
alter table events enable row level security;
alter table meal_plans enable row level security;
alter table pantry_items enable row level security;
alter table shopping_items enable row level security;
