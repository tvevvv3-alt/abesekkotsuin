import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "ph0",
    num: "—",
    title: "痛みには、\n理由がある。",
    sub: "症状のある場所が原因とは限らない。身体全体を評価することで、本当の原因が見えてきます。",
    accent: true,
  },
  {
    id: "ph1",
    num: "01",
    title: "評価する",
    sub: "なぜ痛いのか。なぜ繰り返すのか。動作・姿勢・負荷のバランスを丁寧に評価します。",
    accent: false,
  },
  {
    id: "ph2",
    num: "02",
    title: "整える",
    sub: "評価に基づき、手技と機器で原因にアプローチ。変化を引き出します。",
    accent: false,
  },
  {
    id: "ph3",
    num: "03",
    title: "再び動ける\n身体へ",
    sub: "痛みが取れたあとも、再発しない身体へ。動作の再教育まで伴走します。",
    accent: false,
  },
];

export default function PhilosophyCards() {
  return (
    <CardCarousel
      sectionLabel="PHILOSOPHY"
      sectionTitle="阿部接骨院の考え方"
      cards={cards.map((c) => ({
        id: c.id,
        content: (
          <div
            className={`h-full min-h-[52vw] rounded-2xl p-7 flex flex-col justify-between ${
              c.accent
                ? "bg-gradient-to-br from-[#0F2240] to-[#0B1A30] border border-gold/30"
                : "bg-[#0B1A30] border border-gold/12"
            }`}
          >
            <p className="font-bebas text-4xl text-gold/20 leading-none">{c.num}</p>
            <div>
              <h3 className="font-serif text-xl font-bold text-ink leading-tight mb-3 whitespace-pre-line">
                {c.title}
              </h3>
              <p className="text-ink/50 text-xs leading-relaxed">{c.sub}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
