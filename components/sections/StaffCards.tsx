import CardCarousel from "../CardCarousel";

const staff = [
  {
    id: "s1",
    name: "阿部 皓哉",
    en: "Terutoshi Abe",
    role: "院長 · 柔道整復師",
    desc: "スポーツ現場での帯同経験を活かし、アスリートから一般の方まで幅広く対応。身体の根本的な原因へのアプローチを得意とする。MLBスプリングトレーニング視察、RISE選手サポートなどの実績を持つ。",
    initial: "阿",
  },
  {
    id: "s2",
    name: "澁谷",
    en: "Shibuya",
    role: "柔道整復師",
    desc: "丁寧な評価と細やかな施術で、患者さんの不安を一つずつ解消。患者さんの話をしっかり聞き、寄り添う姿勢を大切にしている。",
    initial: "澁",
  },
  {
    id: "s3",
    name: "萩原",
    en: "Hagiwara",
    role: "スタッフ",
    desc: "患者さんが安心して通えるよう、院内の雰囲気づくりと受付業務を担当。笑顔でお迎えします。",
    initial: "萩",
  },
];

export default function StaffCards() {
  return (
    <CardCarousel
      sectionLabel="STAFF"
      sectionTitle="スタッフ紹介"
      cards={staff.map((s) => ({
        id: s.id,
        content: (
          <div className="h-full min-h-[60vw] bg-[#0B1A30] border border-gold/12 rounded-2xl overflow-hidden flex flex-col">
            {/* Photo area */}
            <div className="flex-shrink-0 h-32 bg-gradient-to-br from-[#0F2240] to-[#080F1C] flex items-center justify-center relative">
              <span className="font-serif text-6xl font-bold text-gold/15">{s.initial}</span>
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-gold/20 via-gold/40 to-gold/20" />
            </div>
            {/* Info */}
            <div className="p-6 flex flex-col justify-between flex-1">
              <div>
                <p className="font-bebas text-[10px] tracking-[0.25em] text-gold/50 mb-1">{s.en}</p>
                <h3 className="font-serif text-xl font-bold text-ink mb-0.5">{s.name}</h3>
                <p className="text-gold/60 text-xs tracking-widest mb-4">{s.role}</p>
                <p className="text-ink/50 text-xs leading-relaxed">{s.desc}</p>
              </div>
            </div>
          </div>
        ),
      }))}
    />
  );
}
