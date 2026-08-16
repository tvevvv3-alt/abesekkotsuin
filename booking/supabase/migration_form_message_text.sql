-- 問診票・体幹教室申込書のLINE送信本文（設定で編集可）を settings に追加
alter table settings add column if not exists questionnaire_text text;
alter table settings add column if not exists class_application_text text;
