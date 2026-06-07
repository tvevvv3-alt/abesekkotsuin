// Photos needed in public/photos/:
//   sports-banner.jpg   — 横断幕・チームバナー
//   sports-uniform.jpg  — ユニフォーム・サイン
//   sports-rise.jpg     — RISEポスター・格闘技サポート
//   sports-mlb.jpg      — MLB視察（trainer-mlb.jpg と共通可）
//   sports-field.jpg    — 帯同・フィールド活動（trainer-field.jpg と共通可）

import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "sp0",
    photo: "/photos/sports-banner.jpg",
    en: "SPORTS SUPPORT",
    title: "選手とともに\n歩んできた実績",
    sub: "スポーツ現場での帯同経験が、院での施術に活きています。",
    isIntro: true,
  },
  {
    id: "sp1",
    photo: "/photos/trainer-mlb.jpg",
    num: "01",
    en: "MLB SPRING TRAINING",
    title: "MLBスプリング\nトレーニング視察",
    sub: "メジャーリーグの現場で、世界トップレベルのスポーツ医療を学ぶ。",
  },
  {
    id: "sp2",
    photo: "/photos/sports-rise.jpg",
    num: "02",
    en: "RISE ATHLETE SUPPORT",
    title: "RISE\n選手サポート",
    sub: "格闘技選手の試合帯同・コンディショニング・ケガ対応をサポート。",
  },
  {
    id: "sp3",
    photo: "/photos/sports-banner.jpg",
    num: "03",
    en: "SCHOOL & TEAM SUPPORT",
    title: "学校・チーム\nサポート",
    sub: "地域の学校や競技チームに出向き、選手の身体をサポートします。",
  },
  {
    id: "sp4",
    photo: "/photos/trainer-field.jpg",
    num: "04",
    en: "TEAM TRAINER",
    title: "帯同\nトレーナー活動",
    sub: "試合・遠征・合宿に帯同。現場での即時対応と予防ケアを担います。",
  },
];

export default function SportsSection() {
  return (
    <CardCarousel
      sectionLabel="10 · SPORTS"
      sectionTitle="スポーツサポート実績"
      cards={cards.map((c) => ({
        id: c.id,
        content: (
          <div className="relative h-[64vw] rounded-2xl overflow-hidden flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${c.photo}')` }}
            />
            <div className={`absolute inset-0 ${
              c.isIntro
                ? "bg-gradient-to-br from-[#0D2040]/95 via-[#0A1828]/80 to-[#060E1A]/90"
                : "bg-gradient-to-t from-[#050D18]/96 via-[#050D18]/55 to-[#060F1E]/25"
            }`} />
            {!c.isIntro && c.num && (
              <span
                className="absolute top-4 right-5 font-bebas leading-none select-none text-gold/8"
                style={{ fontSize: "clamp(72px, 20vw, 100px)" }}
              >
                {c.num}
              </span>
            )}
            <div className="relative z-10 p-7">
              {c.isIntro && <div className="h-px w-8 bg-gold/50 mb-4" />}
              <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/40 mb-3">{c.en}</p>
              <h3
                className="font-serif font-bold text-ink leading-[1.2] mb-2 whitespace-pre-line"
                style={{ fontSize: c.isIntro ? "clamp(20px, 5.5vw, 26px)" : "clamp(19px, 5.5vw, 24px)" }}
              >
                {c.title}
              </h3>
              <p className="text-ink/38 text-[11px] leading-relaxed">{c.sub}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
