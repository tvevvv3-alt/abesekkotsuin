-- 予約トップのお知らせ（院別）を settings に追加
alter table settings add column if not exists notice_ibaraki text;
alter table settings add column if not exists notice_kawanishi text;
