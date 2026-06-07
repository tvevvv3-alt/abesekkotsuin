// Photos needed in public/photos/:
//   treatment-acuscope.jpg — アキュスコープ施術
//   treatment-manual.jpg   — 手技施術
//   treatment-eresus.jpg   — エレサス
//   treatment-hc.jpg       — ハイチャージNEO

import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "tr0",
    photo: "/photos/treatment-acuscope.jpg",
    en: "TREATMENT",
    title: "状態に合わせて、\n必要な方法を\n組み合わせます。",
    sub: "機器は手段にすぎません。評価で見えた原因に対して、最も効果的な方法を選択します。",
    isIntro: true,
  },
  {
    id: "tr1",
    photo: "/photos/treatment-acuscope.jpg",
    en: "ACUSCOPE",
    title: "アキュスコープ",
    sub: "細胞レベルから、回復を後押しする。",
    isIntro: false,
  },
  {
    id: "tr2",
    photo: "/photos/treatment-manual.jpg",
    en: "MANUAL THERAPY",
    title: "手技施術",
    sub: "硬くなった組織を、丁寧にほぐす。",
    isIntro: false,
  },
  {
    id: "tr3",
    photo: "/photos/treatment-eresus.jpg",
    en: "ELESUS",
    title: "エレサス",
    sub: "深部の痛みに、直接届かせる。",
    isIntro: false,
  },
  {
    id: "tr4",
    photo: "/photos/treatment-hc.jpg",
    en: "HIGH CHARGE NEO",
    title: "ハイチャージNEO",
    sub: "全身の電気的バランスを整える。",
    isIntro: false,
  },
];

export default function TreatmentSection() {
  return (
    <CardCarousel
      sectionLabel="05 · TREATMENT"
      sectionTitle="施術"
      cards={cards.map((c) => ({
        id: c.id,
        content: (
          <div className="relative h-[68vw] rounded-2xl overflow-hidden flex flex-col justify-end">
            {c.photo && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${c.photo}')` }}
              />
            )}
            <div className={`absolute inset-0 ${
              c.isIntro
                ? "bg-gradient-to-t from-[#050D18]/97 via-[#050D18]/60 to-[#050D18]/30"
                : "bg-gradient-to-t from-[#050D18]/96 via-[#050D18]/55 to-[#0A1828]/25"
            }`} />
            <div className="relative z-10 p-7">
              {c.isIntro && <div className="h-px w-8 bg-gold/50 mb-4" />}
              <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/40 mb-3">{c.en}</p>
              <h3
                className="font-serif font-bold text-ink leading-[1.2] mb-3 whitespace-pre-line"
                style={{ fontSize: c.isIntro ? "clamp(18px, 5vw, 22px)" : "clamp(19px, 5.5vw, 24px)" }}
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
