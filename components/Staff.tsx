import Reveal from "./Reveal";

const staff = [
  {
    name: "阿部 皓哉",
    en: "Terutoshi Abe",
    role: "院長 · 柔道整復師",
    desc: "スポーツ現場での経験を活かし、アスリートから一般の方まで幅広く対応。身体の根本的な原因へのアプローチを得意とします。",
  },
  {
    name: "澁谷",
    en: "Shibuya",
    role: "柔道整復師",
    desc: "丁寧な評価と細やかな施術で、患者さんの不安を一つずつ解消します。",
  },
  {
    name: "萩原",
    en: "Hagiwara",
    role: "スタッフ",
    desc: "患者さんが安心して通えるよう、院内の雰囲気づくりを大切にしています。",
  },
];

export default function Staff() {
  return (
    <section id="staff" className="bg-navy py-24 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">STAFF</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-ink mb-16 leading-relaxed">
            スタッフ紹介
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-8">
          {staff.map((s, i) => (
            <Reveal key={s.en} delay={0.1 * i}>
              <div className="group">
                {/* Photo placeholder */}
                <div className="aspect-[3/4] bg-navy-light rounded-sm mb-6 overflow-hidden relative border border-gold/10 group-hover:border-gold/20 transition-colors duration-500">
                  <div className="absolute inset-0 flex items-end p-6">
                    <div className="w-full h-px bg-gradient-to-r from-gold/20 to-transparent" />
                  </div>
                  {/* Avatar initial */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-serif text-5xl font-bold text-gold/15">
                      {s.name[0]}
                    </span>
                  </div>
                </div>

                <p className="font-bebas text-xs tracking-[0.25em] text-gold/50 mb-1">{s.en}</p>
                <h3 className="font-serif text-xl font-bold text-ink mb-1">{s.name}</h3>
                <p className="text-gold/60 text-xs tracking-widest mb-4">{s.role}</p>
                <p className="text-ink/50 text-sm leading-relaxed">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
