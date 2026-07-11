-- =====================================================================
--  阿部接骨院 電子カルテ  デモ用ダミーデータ
--  前提: schema.sql を実行済み、かつ staff に院長(role='director')が
--        1名以上登録されていること（README の初期セットアップ参照）。
--  使い方: Supabase SQL Editor に貼り付けて実行。
--  何度実行しても重複しないよう patient_number で on conflict を判定します。
-- =====================================================================

-- 院長スタッフのIDを担当・作成者・記録者として使う
do $$
declare
  dir uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
begin
  select id into dir from public.staff where role = 'director' and active order by created_at limit 1;
  if dir is null then
    raise exception '院長(role=director)のスタッフが未登録です。先に staff を登録してください。';
  end if;

  -- ---------- 患者 ----------
  insert into public.patients
    (patient_number, name, name_kana, birth_date, sex, phone, school, team, sport, position,
     guardian_name, guardian_contact, medical_history, allergies, assigned_staff_id, first_visit_date, created_by)
  values
    ('P0001','田中 陽翔','タナカ ハルト','2010-05-12','male','090-1234-5678','中央中学校','FC茨木ジュニア','サッカー','MF',
     '田中 由美','090-1111-2222','特になし','なし',dir,'2026-06-28',dir),
    ('P0002','佐藤 美咲','サトウ ミサキ','2008-11-03','female','080-2222-3333','桜丘高校','桜丘バスケ部','バスケットボール','ガード',
     '佐藤 健一','080-4444-5555','中学時に左膝痛','なし',dir,'2026-07-04',dir),
    ('P0003','鈴木 大和','スズキ ヤマト','2012-02-20','male','090-5555-6666','川西小学校','川西リトルリーグ','野球','投手',
     '鈴木 明','090-7777-8888','なし','卵',dir,'2026-07-08',dir),
    ('P0004','山本 蓮','ヤマモト レン','2005-08-30','male','070-8888-9999','関西体育大学','陸上競技部','陸上（短距離）','100m',
     null,null,'右ハムストリング肉離れ（1年前）','なし',dir,'2026-07-09',dir),
    ('P0005','中村 咲良','ナカムラ サクラ','2011-07-15','female','080-1010-2020','緑丘中学校','緑丘バレー部','バレーボール','アタッカー',
     '中村 恵','080-3030-4040','なし','なし',dir,'2026-07-10',dir)
  on conflict (patient_number) do nothing;

  select id into p1 from public.patients where patient_number='P0001';
  select id into p2 from public.patients where patient_number='P0002';
  select id into p3 from public.patients where patient_number='P0003';

  -- ---------- カルテ（患者にカルテが未登録のときだけ投入）----------
  if not exists (select 1 from public.charts where patient_id = p1) then
    insert into public.charts (patient_id, chart_type, visit_date, author_id, pain_score, treatments, data) values
    (p1,'initial','2026-06-28',dir,6,
     '{"machines":["アキュスコープ","エコー"],"methods":["アイシング","テーピング"],"other":""}',
     '{"chief_complaint":"右足首の外側の痛み","injury_date":"2026-06-27","injury_mechanism":"サッカーの試合中に着地でひねった","diagnosis":"右足関節外側靭帯損傷（前距腓靭帯）","tenderness":"外果前方に著明","swelling":"（＋）中等度","heat":"（＋）軽度","bruising":"（±）","rom":"背屈・底屈とも制限あり","echo_finding":"前距腓靭帯の肥厚・低エコー像","assessment":"Ⅱ度捻挫。競技復帰まで3〜4週の見込み","treatment_plan":"急性期はRICE＋アキュスコープ。段階的に可動域・荷重訓練","return_estimate":"約3〜4週","next_check":"腫脹の推移と荷重時痛"}'),
    (p1,'followup','2026-07-02',dir,3,
     '{"machines":["アキュスコープ","マイオパルス"],"methods":["運動療法","ストレッチ"],"other":""}',
     '{"change_from_last":"腫脹が引き、歩行時痛が軽減","tenderness":"軽度残存","swelling":"（±）","rom":"背屈やや改善","practice_status":"軽い自主トレのみ","post_treatment_change":"可動域が拡大、歩行安定","self_care":"チューブでの底背屈運動を指導","next_check":"ジョグ開始の可否"}');
  end if;

  if not exists (select 1 from public.charts where patient_id = p2) then
    insert into public.charts (patient_id, chart_type, visit_date, author_id, pain_score, treatments, data) values
    (p2,'initial','2026-07-04',dir,5,
     '{"machines":["ハイチャージNEO","エコー"],"methods":["手技療法","温熱療法"],"other":"膝サポーター調整"}',
     '{"chief_complaint":"左膝前面の痛み","injury_mechanism":"ジャンプ着地の繰り返しで慢性的に","diagnosis":"膝蓋腱炎（ジャンパー膝）疑い","tenderness":"膝蓋腱付着部","swelling":"（−）","echo_finding":"膝蓋腱の軽度肥厚","assessment":"オーバーユース。負荷管理が必要","treatment_plan":"ハイチャージ＋大腿四頭筋ストレッチ","return_estimate":"練習量を調整しつつ継続可","next_check":"ジャンプ時痛の変化"}');
  end if;

  if not exists (select 1 from public.charts where patient_id = p3) then
    insert into public.charts (patient_id, chart_type, visit_date, author_id, pain_score, treatments, data) values
    (p3,'initial','2026-07-08',dir,4,
     '{"machines":["エコー","ディープオシレーション"],"methods":["手技療法","アイシング"],"other":""}',
     '{"chief_complaint":"投球時の右肘内側の痛み","injury_mechanism":"投げ込みの増加","diagnosis":"内側上顆炎（野球肘）疑い","tenderness":"内側上顆","swelling":"（−）","echo_finding":"骨端線に軽度の不整","assessment":"成長期の投球障害。投球中止が望ましい","treatment_plan":"投球休止＋前腕ストレッチ、フォーム確認","return_estimate":"2〜3週の投球休止後に再評価","next_check":"安静時痛の有無"}');
  end if;

  -- ---------- 申し送り ----------
  if not exists (select 1 from public.handovers) then
    insert into public.handovers (body, author_id, resolved) values
    ('田中さん（P0001）明日はジョグ開始可否を確認。腫脹が残るようなら継続アイシングで。', dir, false),
    ('エコーのゼリー在庫が残りわずかです。発注お願いします。', dir, true);
  end if;
end $$;
