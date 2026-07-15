import ComingSoon from "@/components/ComingSoon";

export default function Page() {
  return (
    <ComingSoon
      title="予約公開設定"
      desc="月ごとの予約公開スケジュール（対象年月・公開日時・受付期間・公開/非公開・今すぐ公開/一時非公開）を設定します。公開前は患者側に『◯月分の予約は◯月◯日◯時から受付開始予定です』と表示します。"
    />
  );
}
