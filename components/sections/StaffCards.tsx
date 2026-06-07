// Photos needed in public/photos/:
//   staff-abe.jpg      — 阿部皓哉 院長
//   staff-shibuya.jpg  — 澁谷
//   staff-hagiwara.jpg — 萩原
//   staff-hayashi.jpg  — 林
// Background: ネイビー単色（統一感）

import CardCarousel from "../CardCarousel";

const staff = [
  {
    id: "s1",
    photo: "/photos/staff-abe.jpg",
    name: "阿部 皓哉",
    en: "TERUTOSHI ABE",
    role: "院長 · 柔道整復師",
    desc: "スポーツ現場での帯同経験を活かし、アスリートから一般の方まで幅広く対応。身体の根本的な原因へのアプローチを得意とする。MLBスプリングトレーニング視察、RISE選手サポートなどの実績を持つ。",
    initial: "阿",
  },
  {
    id: "s2",
    photo: "/photos/staff-shibuya.jpg",
    name: "澁谷",
    en: "SHIBUYA",
    role: "柔道整復師",
    desc: "丁寧な評価と細やかな施術で、患者さんの不安を一つずつ解消。患者さんの話をしっかり聞き、寄り添う姿勢を大切にしている。",
    initial: "澁",
  },
  {
    id: "s3",
    photo: "/photos/staff-hagiwara.jpg",
    name: "萩原",
    en: "HAGIWARA",
    role: "スタッフ",
    desc: "患者さんが安心して通えるよう、院内の雰囲気づくりと受付業務を担当。笑顔でお迎えします。",
    initial: "萩",
  },
  {
    id: "s4",
    photo: "/photos/staff-hayashi.jpg",
    name: "林",
    en: "HAYASHI",
    role: "スタッフ",
    desc: "",
    initial: "林",
  },
];

export default function StaffCards() {
  return (
    <CardCarousel
      sectionLabel="06 · STAFF"
      sectionTitle="スタッフ紹介"
      cards={staff.map((s) => ({
        id: s.id,
        content: (
          <div className="h-[82vw] bg-[#0A1828] border border-gold/8 rounded-2xl overflow-hidden flex flex-col">
            {/* Photo area — top 56% */}
            <div
              className="relative flex-shrink-0 overflow-hidden bg-[#0D2040]"
              style={{ height: "47vw" }}
            >
              {/* Real photo as background */}
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${s.photo}')` }}
              />
              {/* Fallback initial when no photo */}
              <span
                className="absolute inset-0 flex items-center justify-center font-serif font-bold text-gold/6 select-none"
                style={{ fontSize: "clamp(90px, 25vw, 130px)" }}
              >
                {s.initial}
              </span>
              {/* Bottom gradient for name overlay */}
              <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-[#0A1828] to-transparent" />
              {/* Name info */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/40 mb-0.5">{s.en}</p>
                <h3
                  className="font-serif font-bold text-ink leading-tight mb-0.5"
                  style={{ fontSize: "clamp(18px, 5vw, 22px)" }}
                >
                  {s.name}
                </h3>
                <p className="text-gold/50 text-[10px] tracking-widest">{s.role}</p>
              </div>
            </div>

            {/* Profile text — bottom 44% */}
            <div className="flex-1 px-5 py-5 flex items-center border-t border-gold/8">
              {s.desc ? (
                <p className="text-ink/38 text-[11px] leading-relaxed">{s.desc}</p>
              ) : (
                <p className="text-ink/20 text-[11px] italic">プロフィールを入力してください</p>
              )}
            </div>
          </div>
        ),
      }))}
    />
  );
}
