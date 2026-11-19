-- 体幹カルテ 各回の詳細ページ用：身体図・手書きメモの描き込みを保存
-- class_notes が無い環境向けに作成も含める（既にあれば列追加のみ）
create table if not exists class_notes (
  appointment_id uuid primary key references appointments(id) on delete cascade,
  note text,
  updated_at timestamptz default now()
);

alter table class_notes add column if not exists body_marks jsonb default '[]'::jsonb;
alter table class_notes add column if not exists memo_marks jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';
