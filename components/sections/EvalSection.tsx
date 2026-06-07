// Photos needed in public/photos/:
//   treatment-echo.jpg    — エコー説明・評価風景
//   eval-shoulder.jpg     — 肩可動域評価（腕を横から上げている写真）
//   eval-skeleton.jpg     — 骨格模型を使った説明（任意）

import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "ev0",
    photo: "/photos/treatment-echo.jpg",
    en: "EVALUATION",
    title: "原因を探すために、\n評価を大切にしています。",
    sub: "機器ありきの施術ではありません。なぜそこに症状が出るのか——原因を特定してから、最適な方法を選びます。",
    isIntro: true,
  },
  {
    id: "ev1",
    photo: "/photos/treatment-echo.jpg",
    en: "ECHO · ULTRASOUND",
    title: "エコー観察装置",
    sub: "痛みの原因を、目で見て確かめる。",
    isIntro: false,
  },
  {
    id: "ev2",
    photo: "/photos/eval-shoulder.jpg",
    en: "RANGE OF MOTION",
    title: "可動域・動作評価",
    sub: "どこが動いていないか、何が制限しているか。身体全体を動かしながら評価します。",
    isIntro: false,
  },
  {
    id: "ev3",
    photo: "/photos/eval-skeleton.jpg",
    en: "EXPLANATION",
    title: "骨格模型で\n丁寧に説明",
    sub: "原因と施術方針をわかりやすくお伝えします。疑問はその場でご質問ください。",
    isIntro: false,
  },
];

export default function EvalSection() {
  return (
    <CardCarousel
      sectionLabel="04 · EVALUATION"
      sectionTitle="評価"
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
