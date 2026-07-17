-- メニュー一覧カード：短い説明・バッジ・画像
alter table public.services add column if not exists short_desc text;
alter table public.services add column if not exists badge      text;

-- メニュー画像用ストレージ（公開バケット）
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

drop policy if exists "menu_images_read" on storage.objects;
create policy "menu_images_read" on storage.objects
  for select using (bucket_id = 'menu-images');
drop policy if exists "menu_images_insert" on storage.objects;
create policy "menu_images_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'menu-images');
drop policy if exists "menu_images_update" on storage.objects;
create policy "menu_images_update" on storage.objects
  for update to authenticated using (bucket_id = 'menu-images') with check (bucket_id = 'menu-images');
drop policy if exists "menu_images_delete" on storage.objects;
create policy "menu_images_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'menu-images');

-- 一覧カード用のバッジ・短い説明（未設定のみ）
update public.services set badge = coalesce(badge,'基本'),     short_desc = coalesce(short_desc,'担当者による施術30分の基本メニューです。')       where name = '施術30分';
update public.services set badge = coalesce(badge,'集中ケア'),  short_desc = coalesce(short_desc,'慢性症状や、じっくり施術を受けたい方向けです。')   where name = '施術60分';
update public.services set badge = coalesce(badge,'20:30以降'), short_desc = coalesce(short_desc,'通常時間外に施術を希望する方向けです。')       where name = '時間外予約';
update public.services set short_desc = coalesce(short_desc,'まず全身通電で身体を整えやすい状態にし、その後30分間の施術を行います。')       where name = '施術30分＋全身通電20分';
update public.services set short_desc = coalesce(short_desc,'定員4名の少人数制体幹トレーニングです。')                                       where name = '体幹教室';
update public.services set short_desc = coalesce(short_desc,'川西整体院での整体施術（50分）です。')                                         where name = '川西整体院';
