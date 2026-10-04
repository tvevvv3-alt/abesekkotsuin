-- 問診票の自動送信ON/OFF。初診 or 前回来院から一定日数(既定60日=約2ヶ月)空いた予約で、
-- LINE連携時に問診票リンクを自動送信する。
-- Supabase の SQL Editor で1回だけ実行（再実行しても安全）。

alter table public.settings add column if not exists questionnaire_auto boolean not null default false;
-- 自動送信とみなす「来院ブランク」の日数（この日数以上あいたら再送）。既定60日。
alter table public.settings add column if not exists questionnaire_gap_days int not null default 60;
