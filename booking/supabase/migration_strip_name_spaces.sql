-- 【一回きり】既存の氏名から空白（半角/全角スペース）を除去して表記を統一する。
-- スペースを入れる人/入れない人が混在して見づらく、照合もズレるため。
-- 患者・予約・各名簿の氏名カラムをまとめて掃除する（物販の商品名=sales.patient_nameは対象外）。
-- Supabase の SQL Editor で実行（再実行しても安全）。

update public.patients
   set name = regexp_replace(name, '[[:space:]　]', '', 'g')
 where name ~ '[[:space:]　]';
update public.patients
   set name_kana = regexp_replace(name_kana, '[[:space:]　]', '', 'g')
 where name_kana ~ '[[:space:]　]';

update public.appointments
   set patient_name = regexp_replace(patient_name, '[[:space:]　]', '', 'g')
 where patient_name ~ '[[:space:]　]';

-- 体幹教室・パーソナル・新患名簿などの氏名（予約の氏名と突き合わせるため揃える）
update public.class_members
   set name = regexp_replace(name, '[[:space:]　]', '', 'g')
 where name ~ '[[:space:]　]';
update public.class_purchases
   set name = regexp_replace(name, '[[:space:]　]', '', 'g')
 where name ~ '[[:space:]　]';
update public.personal_tickets
   set name = regexp_replace(name, '[[:space:]　]', '', 'g')
 where name ~ '[[:space:]　]';
update public.new_patients
   set name = regexp_replace(name, '[[:space:]　]', '', 'g')
 where name ~ '[[:space:]　]';
update public.new_patients
   set kana = regexp_replace(kana, '[[:space:]　]', '', 'g')
 where kana ~ '[[:space:]　]';
