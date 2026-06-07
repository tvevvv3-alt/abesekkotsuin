// Photos needed in public/photos/:
//   treatment-echo.jpg      — エコー説明・評価風景
//   treatment-acuscope.jpg  — アキュスコープ施術
//   treatment-manual.jpg    — 手技施術
//   treatment-hc.jpg        — ハイチャージNEO
//   treatment-eresus.jpg    — エレサス

import CardCarousel from "../CardCarousel";

const sections = [
  // Section intro
  {
    id: "intro",
    type: "intro" as const,
    photo: "/photos/treatment-echo.jpg",
    en: "EVALUATION",
    title: "まず、原因を探す。",
    desc: "機器ありきの施術ではありません。評価で見えた原因に対して、最適な方法を組み合わせます。",
  },
  // Individual treatments
  {
    id: "t1",
    type: "item" as const,
    photo: "/photos/treatment-echo.jpg",
    en: "ECHO · EVALUATION",
    title: "エコー観察装置",
    result: "痛みの原因を、目で見て確かめる。",
  },
  {
    id: "t2",
    type: "item" as const,
    photo: "/photos/treatment-acuscope.jpg",
    en: "ACUSCOPE",
    title: "アキュスコープ",
    result: "細胞レベルから、回復を後押しする。",
  },
  {
    id: "t3",
    type: "item" as const,
    photo: "/photos/treatment-manual.jpg",
    en: "MANUAL THERAPY",
    title: "手技施術",
    result: "硬くなった組織を、丁寧にほぐす。",
  },
  {
    id: "t4",
    type: "item" as const,
    photo: "/photos/treatment-hc.jpg",
    en: "HIGH CHARGE NEO",
    title: "ハイチャージNEO",
    result: "全身の電気的バランスを整える。",
  },
  {
    id: "t5",
    type: "item" as const,
    photo: "/photos/treatment-eresus.jpg",
    en: "ELESUS",
    title: "エレサス",
    result: "深部の痛みに、直接届かせる。",
  },
];

export default function TechCards() {
  return (
    <CardCarousel
      sectionLabel="04 · TREATMENT"
      sectionTitle="その考え方を支える技術"
      cards={sections.map((s) => ({
        id: s.id,
        content:
          s.type === "intro" ? (
            <div className="relative h-[68vw] rounded-2xl overflow-hidden flex flex-col justify-end">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${s.photo}')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050D18]/95 via-[#050D18]/55 to-[#050D18]/25" />
              <div className="relative z-10 p-7">
                <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/50 mb-3">{s.en}</p>
                <div className="h-px w-8 bg-gold/50 mb-4" />
                <h3
                  className="font-serif font-bold text-ink leading-[1.2] mb-3"
                  style={{ fontSize: "clamp(20px, 5.5vw, 26px)" }}
                >
                  {s.title}
                </h3>
                <p className="text-ink/40 text-[11px] leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ) : (
            <div className="relative h-[68vw] rounded-2xl overflow-hidden flex flex-col justify-end">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${s.photo}')` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050D18]/96 via-[#050D18]/60 to-[#0A1828]/30" />
              <div className="relative z-10 p-7">
                <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/45 mb-3">{s.en}</p>
                <h3
                  className="font-serif font-bold text-ink leading-tight mb-2"
                  style={{ fontSize: "clamp(19px, 5vw, 24px)" }}
                >
                  {s.title}
                </h3>
                <p className="text-ink/40 text-[11px] leading-relaxed">{s.result}</p>
              </div>
            </div>
          ),
      }))}
    />
  );
}
