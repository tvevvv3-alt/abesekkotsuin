import CardCarousel from "../CardCarousel";

const techs = [
  {
    id: "t1",
    name: "エコー観察装置",
    en: "ULTRASOUND ECHO",
    purpose: "筋肉・腱・靭帯をリアルタイムで可視化。\n見えない原因を、見える化します。",
  },
  {
    id: "t2",
    name: "アキュスコープ",
    en: "ACUSCOPE",
    purpose: "微弱電流で細胞レベルの回復を促進。\n炎症を内側から鎮めます。",
  },
  {
    id: "t3",
    name: "マイオパルス",
    en: "MYOPULSE",
    purpose: "筋膜・結合組織に直接アプローチ。\n硬くなった組織をほぐします。",
  },
  {
    id: "t4",
    name: "エレサス",
    en: "ELESUS",
    purpose: "ハイボルテージで深部の痛みへ。\n急性期から回復期まで対応します。",
  },
  {
    id: "t5",
    name: "ハイチャージNEO",
    en: "HIGH CHARGE NEO",
    purpose: "全身の電気的バランスを整える通電療法。\n疲労回復と身体機能の最適化に。",
  },
];

export default function TechCards() {
  return (
    <CardCarousel
      sectionLabel="TECHNOLOGY"
      sectionTitle="その考え方を支える技術"
      cards={techs.map((t) => ({
        id: t.id,
        content: (
          <div className="h-full min-h-[52vw] bg-[#0B1A30] border border-gold/12 rounded-2xl p-7 flex flex-col justify-between">
            <div className="w-8 h-px bg-gold/40" />
            <div>
              <p className="font-bebas text-[10px] tracking-[0.25em] text-gold/50 mb-2">{t.en}</p>
              <h3 className="font-serif text-xl font-bold text-ink mb-4">{t.name}</h3>
              <p className="text-ink/50 text-xs leading-relaxed whitespace-pre-line">{t.purpose}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
