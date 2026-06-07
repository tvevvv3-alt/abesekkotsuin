// Photos needed in public/photos/:
//   trunk-mat.jpg    — 青マット・アダプベース上でのトレーニング風景
//   trunk-adap.jpg   — アダプベース片脚立ち（任意）

import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "tk0",
    photo: "/photos/trunk-mat.jpg",
    en: "TRUNK CLASS",
    title: "身体を使いこなす\n力を育てる。",
    sub: "バランス・姿勢・感覚入力・動作コントロール・身体認識——を高めることを目的としています。スポーツのパフォーマンス向上やケガ予防にも活用されています。",
    isIntro: true,
  },
  {
    id: "tk1",
    photo: "/photos/eval-run.jpg",
    en: "ADAP BASE",
    title: "アダプベース\nトレーニング",
    sub: "不安定な環境での動作訓練。本番の競技場面に近い感覚入力で身体を整えます。",
    isIntro: false,
  },
  {
    id: "tk2",
    photo: "/photos/trunk-adap.jpg",
    en: "SINGLE LEG",
    title: "片脚立ち・\nバランス訓練",
    sub: "土台となる安定性を作る。ケガを繰り返さないための基礎づくりです。",
    isIntro: false,
  },
];

export default function TrunkSection() {
  return (
    <CardCarousel
      sectionLabel="07 · TRUNK CLASS"
      sectionTitle="体幹教室"
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
                ? "bg-gradient-to-t from-[#050D18]/97 via-[#050D18]/65 to-[#060F1E]/35"
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
