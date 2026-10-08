-- 体幹教室：月ごとの「体幹テスト 済/未」の手動チェック。氏名×年月で管理。
-- 自動判定（当月にテスト入力あり／当月に終了あり）に対する手動の上書き。
--   tested = true  → 手動で「済」にした
--   tested = false → 手動で「未」に戻した（自動で済でも未表示にする）
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

create table if not exists public.class_test_marks (
  name       text not null,
  ym         text not null,            -- 'YYYY-MM'
  tested     boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (name, ym)
);
create index if not exists class_test_marks_ym_idx on public.class_test_marks (ym);

alter table public.class_test_marks enable row level security;
drop policy if exists class_test_marks_staff_all on public.class_test_marks;
create policy class_test_marks_staff_all on public.class_test_marks
  for all to authenticated using (true) with check (true);
