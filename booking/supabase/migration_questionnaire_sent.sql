-- 問診票をLINEで送った日時を記録（予約変更モーダルに「M/D 送信済」を表示するため）
alter table public.appointments
  add column if not exists questionnaire_sent_at timestamptz;
