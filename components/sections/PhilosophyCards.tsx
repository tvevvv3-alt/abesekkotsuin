import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "ph0",
    num: null,
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
    title: "再び\n動ける身体へ",
    sub: "痛みが取れたあとも、再発しない身体へ。動作の再教育まで伴走します。",
    accent: false,
  },
];

export default function PhilosophyCards() {
  return (
    <CardCarousel
      sectionLabel="03 · PHILOSOPHY"
      sectionTitle="阿部接骨院の考え方"
      cards={cards.map((c) => ({
        id: c.id,
        content: c.accent ? (
          // Concept card — centered, statement-driven
          <div className="relative h-[68vw] bg-gradient-to-br from-[#0D2040] to-[#070E1B] border border-gold/20 rounded-2xl overflow-hidden flex flex-col justify-center px-8 py-7">
            <div className="h-px w-10 bg-gold/50 mb-7" />
            <h3
              className="font-serif font-bold text-ink leading-[1.25] mb-5 whitespace-pre-line"
              style={{ fontSize: "clamp(24px, 7vw, 32px)" }}
            >
              {c.title}
            </h3>
            <p className="text-ink/40 text-[11px] leading-relaxed">{c.sub}</p>
          </div>
        ) : (
          // Step card — number dominates, content at bottom
          <div className="relative h-[68vw] bg-[#0A1828] border border-gold/8 rounded-2xl overflow-hidden flex flex-col justify-between p-7">
            {/* Giant faded number */}
            <span
              className="font-bebas leading-none text-gold/7 select-none self-start"
              style={{ fontSize: "clamp(90px, 25vw, 120px)" }}
            >
              {c.num}
            </span>
            {/* Bottom content */}
            <div>
              <h3
                className="font-serif font-bold text-ink leading-[1.2] mb-3 whitespace-pre-line"
                style={{ fontSize: "clamp(20px, 6vw, 26px)" }}
              >
                {c.title}
              </h3>
              <p className="text-ink/40 text-[11px] leading-relaxed">{c.sub}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
