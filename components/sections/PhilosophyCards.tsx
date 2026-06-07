// Photos needed in public/photos/:
//   philosophy-meeting.jpg — スタッフ勉強会写真（ElesAs機器の前で資料を見ている）

import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "ph0",
    photo: "/photos/philosophy-meeting.jpg",
    title: "痛みには、\n理由がある。",
    sub: "私たちは症状そのものではなく、なぜそこに症状が出るのか——を探します。症状のある場所が原因とは限らない。身体全体を評価することで、本当の原因が見えてきます。",
    isIntro: true,
  },
  {
    id: "ph1",
    photo: "/photos/philosophy-meeting.jpg",
    title: "学び続ける\nチームとして",
    sub: "定期的なスタッフ勉強会で知識と技術をアップデート。「ちゃんと見てくれる院」であり続けるために。",
    isIntro: false,
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
            {c.photo && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${c.photo}')` }}
              />
            )}
            <div className={`absolute inset-0 ${
              c.isIntro
                ? "bg-gradient-to-br from-[#0D2040]/95 via-[#0A1828]/82 to-[#060E1A]/92"
                : "bg-gradient-to-t from-[#050D18]/97 via-[#050D18]/65 to-[#0A1828]/30"
            }`} />
            <div className="relative z-10 p-7">
              {c.isIntro && <div className="h-px w-10 bg-gold/50 mb-5" />}
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
