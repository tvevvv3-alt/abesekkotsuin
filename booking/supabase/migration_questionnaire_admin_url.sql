-- =====================================================================
--  設定：問診票の「管理用（回答閲覧）ページ」URL を追加
-- ---------------------------------------------------------------------
--  questionnaire_url … 患者へLINE送信する回答フォーム（/viewform）
--  questionnaire_admin_url … 管理側の回答一覧ページ（例：…/edit#responses）
--    左メニュー「問診票」からはこちらを開く（未設定なら questionnaire_url）。
--
--  Supabase の SQL Editor で1回実行（再実行しても安全）。
-- =====================================================================
alter table public.settings
  add column if not exists questionnaire_admin_url text;
