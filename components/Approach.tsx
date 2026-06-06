import Reveal from "./Reveal";

const steps = [
  {
    num: "01",
    title: "評価する",
    en: "EVALUATE",
    desc: "痛みの場所だけでなく、なぜそこに負担がかかっているのか。身体全体を丁寧に評価します。",
  },
  {
    num: "02",
    title: "整える",
    en: "TREAT",
    desc: "評価に基づき、原因に直接アプローチ。最新機器と手技を組み合わせ、変化を引き出します。",
  },
  {
    num: "03",
    title: "再び動ける身体へ",
    en: "REBUILD",
    desc: "痛みが取れたあとも、再発しない身体をつくるための再教育まで伴走します。",
  },
];

export default function Approach() {
  return (
    <section id="approach" className="bg-navy py-24 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">APPROACH</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-ink mb-20 leading-relaxed">
            私たちが大切にしていること
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-px bg-gold/10">
          {steps.map((s, i) => (
            <Reveal key={s.num} delay={0.12 * i} className="bg-navy p-10 md:p-12">
              <p className="font-bebas text-5xl text-gold/20 mb-6 leading-none">{s.num}</p>
              <p className="font-bebas text-xs tracking-[0.25em] text-gold/50 mb-3">{s.en}</p>
              <h3 className="font-serif text-xl md:text-2xl font-bold text-ink mb-4">{s.title}</h3>
              <p className="text-ink/50 text-sm leading-[2] tracking-wide">{s.desc}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
