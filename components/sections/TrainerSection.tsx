import CardCarousel from "../CardCarousel";

const activities = [
  {
    id: "a1",
    en: "MLB SPRING TRAINING",
    title: "MLBスプリング\nトレーニング視察",
    desc: "メジャーリーグの現場で、世界トップレベルのスポーツ医療を学ぶ。",
  },
  {
    id: "a2",
    en: "RISE ATHLETE SUPPORT",
    title: "RISE\n選手サポート",
    desc: "格闘技選手の試合帯同・コンディショニング・ケガ対応をサポート。",
  },
  {
    id: "a3",
    en: "SCHOOL & TEAM SUPPORT",
    title: "学校・チーム\nサポート",
    desc: "地域の学校や競技チームに出向き、選手の身体をサポートします。",
  },
  {
    id: "a4",
    en: "TEAM TRAINER",
    title: "帯同\nトレーナー活動",
    desc: "試合・遠征・合宿に帯同。現場での即時対応と予防ケアを担います。",
  },
];

export default function TrainerSection() {
  return (
    <CardCarousel
      sectionLabel="ATHLETES & SUPPORT"
      sectionTitle="トレーナー活動"
      cards={activities.map((a) => ({
        id: a.id,
        content: (
          <div className="h-full min-h-[52vw] bg-gradient-to-br from-[#0F2240] to-[#0B1A30] border border-gold/20 rounded-2xl p-7 flex flex-col justify-between">
            <p className="font-bebas text-[10px] tracking-[0.25em] text-gold/50">{a.en}</p>
            <div>
              <h3 className="font-serif text-xl font-bold text-ink leading-tight mb-3 whitespace-pre-line">
                {a.title}
              </h3>
              <p className="text-ink/50 text-xs leading-relaxed">{a.desc}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
