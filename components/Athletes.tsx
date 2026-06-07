import Reveal from "./Reveal";

const activities = [
  { label: "MLBスプリングトレーニング視察", en: "MLB SPRING TRAINING" },
  { label: "RISE選手サポート", en: "RISE ATHLETE SUPPORT" },
  { label: "学校・チームサポート", en: "SCHOOL & TEAM SUPPORT" },
  { label: "帯同トレーナー活動", en: "TEAM TRAINER" },
];

export default function Athletes() {
  return (
    <section className="bg-navy-dark py-24 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">ATHLETES & SUPPORT</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-ink mb-4 leading-relaxed">
            スポーツの現場に、
            <br />
            寄り添い続ける。
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="text-ink/50 text-sm leading-[2] tracking-wide mb-16 max-w-xl">
            院での治療だけでなく、
            競技の現場にも出向きます。
            アスリートの身体を知っているから、
            アスリートの悩みに応えられます。
          </p>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-4">
          {activities.map((a, i) => (
            <Reveal key={a.en} delay={0.08 * i}>
              <div className="border border-gold/12 p-8 rounded-sm hover:border-gold/25 transition-colors duration-500">
                <p className="font-bebas text-xs tracking-[0.25em] text-gold/40 mb-3">{a.en}</p>
                <p className="font-serif text-lg font-bold text-ink">{a.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
