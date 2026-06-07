// Photos needed in public/photos/:
//   rehab-dns.jpg    — DNS指導・動作指導風景
//   rehab-eval.jpg   — 再評価風景
//   rehab-move.jpg   — 動作指導（任意）

import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "rh0",
    photo: "/photos/rehab-dns.jpg",
    en: "REHABILITATION",
    title: "良くするだけでなく、\n繰り返さない\n身体へ。",
    sub: "痛みが取れても、そこで終わりではありません。なぜ繰り返すのか——動作や使い方まで一緒に整えます。",
    isIntro: true,
  },
  {
    id: "rh1",
    photo: "/photos/rehab-dns.jpg",
    en: "DNS · MOVEMENT",
    title: "DNS指導",
    sub: "神経発達学に基づいた動作パターンの再教育。身体の本来の動きを取り戻します。",
    isIntro: false,
  },
  {
    id: "rh2",
    photo: "/photos/rehab-eval.jpg",
    en: "RE-EVALUATION",
    title: "再評価・\n動作確認",
    sub: "施術後の変化をその場で確認。次のステップを一緒に考えます。",
    isIntro: false,
  },
];

export default function RehabSection() {
  return (
    <CardCarousel
      sectionLabel="06 · REHAB"
      sectionTitle="再教育"
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
                ? "bg-gradient-to-br from-[#0D2040]/95 via-[#0A1828]/80 to-[#060E1A]/90"
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
