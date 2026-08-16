-- 体幹教室 申込書リンク（Googleフォーム等）を settings に追加
alter table settings add column if not exists class_application_url text;
