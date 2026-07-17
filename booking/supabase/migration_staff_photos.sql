-- スタッフ顔写真用ストレージ（公開バケット）
insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', true)
on conflict (id) do update set public = true;

-- 公開読み取り（患者画面で表示するため）
drop policy if exists "staff_photos_read" on storage.objects;
create policy "staff_photos_read" on storage.objects
  for select using (bucket_id = 'staff-photos');

-- アップロード・更新・削除は認証済みスタッフのみ
drop policy if exists "staff_photos_insert" on storage.objects;
create policy "staff_photos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'staff-photos');

drop policy if exists "staff_photos_update" on storage.objects;
create policy "staff_photos_update" on storage.objects
  for update to authenticated using (bucket_id = 'staff-photos') with check (bucket_id = 'staff-photos');

drop policy if exists "staff_photos_delete" on storage.objects;
create policy "staff_photos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'staff-photos');
