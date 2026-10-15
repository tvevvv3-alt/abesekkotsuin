-- アプリ内問診票の質問定義（QSection[] のJSON）を保存する列。
-- null のときはアプリ側の既定スキーマ（DEFAULT_SECTIONS）を使用する。
alter table public.settings
  add column if not exists questionnaire_schema jsonb;
