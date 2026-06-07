// Photos needed in public/photos/:
//   trainer-mlb.jpg   — MLB視察
//   trainer-rise.jpg  — RISE選手サポート
//   trainer-team.jpg  — チームサポート
//   trainer-field.jpg — 帯同活動

import CardCarousel from "../CardCarousel";

const activities = [
  {
    id: "a1",
    num: "01",
    photo: "/photos/trainer-mlb.jpg",
    en: "MLB SPRING TRAINING",
    title: "MLBスプリング\nトレーニング視察",
    desc: "メジャーリーグの現場で、世界トップレベルのスポーツ医療を学ぶ。",
  },
  {
    id: "a2",
    num: "02",
    photo: "/photos/trainer-rise.jpg",
    en: "RISE ATHLETE SUPPORT",
    title: "RISE\n選手サポート",
    desc: "格闘技選手の試合帯同・コンディショニング・ケガ対応をサポート。",
  },
  {
    id: "a3",
    num: "03",
    photo: "/photos/trainer-team.jpg",
    en: "SCHOOL & TEAM SUPPORT",
    title: "学校・チーム\nサポート",
    desc: "地域の学校や競技チームに出向き、選手の身体をサポートします。",
  },
  {
    id: "a4",
    num: "04",
    photo: "/photos/trainer-field.jpg",
    en: "TEAM TRAINER",
    title: "帯同\nトレーナー活動",
    desc: "試合・遠征・合宿に帯同。現場での即時対応と予防ケアを担います。",
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
          <div className="relative h-[64vw] rounded-2xl overflow-hidden flex flex-col justify-end">
            {/* Photo */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${a.photo}')` }}
            />
            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050D18]/96 via-[#050D18]/55 to-[#060F1E]/25" />
            {/* Background number */}
            <span
              className="absolute top-4 right-5 font-bebas leading-none select-none text-gold/8"
              style={{ fontSize: "clamp(72px, 20vw, 100px)" }}
            >
              {a.num}
            </span>
            {/* Content */}
            <div className="relative z-10 p-7">
              <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/40 mb-3">{a.en}</p>
              <h3
                className="font-serif font-bold text-ink leading-[1.2] mb-2 whitespace-pre-line"
                style={{ fontSize: "clamp(19px, 5.5vw, 24px)" }}
              >
                {a.title}
              </h3>
              <p className="text-ink/38 text-[11px] leading-relaxed">{a.desc}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
