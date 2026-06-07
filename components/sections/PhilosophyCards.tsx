// Photos needed in public/photos/:
//   philosophy-meeting.jpg — スタッフミーティング・勉強会写真
//   philosophy-eval.jpg    — 評価風景
// (optional — dark gradient fallback if not provided)

import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "ph0",
    photo: "/photos/philosophy-meeting.jpg",
    num: null,
    title: "痛みには、\n理由がある。",
    sub: "症状のある場所が原因とは限らない。身体全体を評価することで、本当の原因が見えてきます。",
    accent: true,
  },
  {
    id: "ph1",
    photo: "/photos/philosophy-eval.jpg",
    num: "01",
    title: "評価する",
    sub: "なぜ痛いのか。なぜ繰り返すのか。動作・姿勢・負荷のバランスを丁寧に評価します。",
    accent: false,
  },
  {
    id: "ph2",
    photo: null,
    num: "02",
    title: "整える",
    sub: "評価に基づき、手技と機器で原因にアプローチ。変化を引き出します。",
    accent: false,
  },
  {
    id: "ph3",
    photo: "/photos/eval-run.jpg",
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
        content: (
          <div className="relative h-[68vw] rounded-2xl overflow-hidden flex flex-col justify-end">
            {/* Photo */}
            {c.photo && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${c.photo}')` }}
              />
            )}
            {/* Overlay */}
            <div className={`absolute inset-0 ${
              c.accent
                ? "bg-gradient-to-br from-[#0D2040]/95 via-[#0A1828]/80 to-[#060E1A]/90"
                : "bg-gradient-to-t from-[#050D18]/97 via-[#050D18]/65 to-[#0A1828]/30"
            }`} />
            {/* Background number */}
            {!c.accent && c.num && (
              <span
                className="absolute top-4 left-6 font-bebas leading-none select-none text-gold/8"
                style={{ fontSize: "clamp(80px, 22vw, 110px)" }}
              >
                {c.num}
              </span>
            )}
            {/* Content */}
            <div className="relative z-10 p-7">
              {c.accent && <div className="h-px w-10 bg-gold/50 mb-5" />}
              <h3
                className="font-serif font-bold text-ink leading-[1.2] mb-3 whitespace-pre-line"
                style={{ fontSize: "clamp(22px, 6.5vw, 30px)" }}
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
