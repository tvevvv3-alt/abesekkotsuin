import CardCarousel from "../CardCarousel";

const activities = [
  {
    id: "a1",
    en: "MLB SPRING TRAINING",
    title: "MLBスプリング\nトレーニング視察",
    desc: "メジャーリーグの現場で、世界トップレベルのスポーツ医療を学ぶ。",
    num: "01",
  },
  {
    id: "a2",
    en: "RISE ATHLETE SUPPORT",
    title: "RISE\n選手サポート",
    desc: "格闘技選手の試合帯同・コンディショニング・ケガ対応をサポート。",
    num: "02",
  },
  {
    id: "a3",
    en: "SCHOOL & TEAM SUPPORT",
    title: "学校・チーム\nサポート",
    desc: "地域の学校や競技チームに出向き、選手の身体をサポートします。",
    num: "03",
  },
  {
    id: "a4",
    en: "TEAM TRAINER",
    title: "帯同\nトレーナー活動",
    desc: "試合・遠征・合宿に帯同。現場での即時対応と予防ケアを担います。",
    num: "04",
  },
];

export default function TrainerSection() {
  return (
    <CardCarousel
      sectionLabel="05 · ATHLETES"
      sectionTitle="トレーナー活動"
      cards={activities.map((a) => ({
        id: a.id,
        content: (
          <div className="relative h-[64vw] bg-gradient-to-br from-[#0D2040] to-[#070E1B] border border-gold/12 rounded-2xl overflow-hidden flex flex-col justify-end p-7">
            {/* Background number */}
            <span
              className="absolute top-4 right-5 font-bebas leading-none select-none text-gold/6"
              style={{ fontSize: "clamp(80px, 22vw, 110px)" }}
            >
              {a.num}
            </span>
            <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/45 mb-4">{a.en}</p>
            <h3
              className="font-serif font-bold text-ink leading-[1.2] mb-3 whitespace-pre-line"
              style={{ fontSize: "clamp(20px, 5.5vw, 26px)" }}
            >
              {a.title}
            </h3>
            <p className="text-ink/40 text-[11px] leading-relaxed">{a.desc}</p>
          </div>
        ),
      }))}
    />
  );
}
