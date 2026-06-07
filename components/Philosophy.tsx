import Reveal from "./Reveal";

export default function Philosophy() {
  return (
    <section id="philosophy" className="bg-navy-dark py-28 md:py-44 px-6 relative overflow-hidden">
      {/* Radial gold glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-gold/3 blur-[120px] pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">PHILOSOPHY</p>
        </Reveal>

        {/* Large statement */}
        <Reveal delay={0.1}>
          <h2 className="font-serif text-4xl md:text-6xl lg:text-7xl font-black text-ink leading-[1.15] tracking-tight mb-14">
            痛みには、
            <br />
            <span className="text-gold">理由がある。</span>
          </h2>
        </Reveal>

        <div className="divider-gold mb-14" />

        {/* Questions */}
        <div className="flex flex-col gap-10">
          {[
            { q: "なぜ痛いのか。", a: "身体のどこかが過剰な負担を受けているサインです。" },
            { q: "なぜ繰り返すのか。", a: "痛みの出る「環境」が変わっていないからかもしれません。" },
            { q: "なぜ思うように動けないのか。", a: "動きの連鎖のどこかに、問題が隠れています。" },
          ].map(({ q, a }, i) => (
            <Reveal key={q} delay={0.1 * i}>
              <div>
                <p className="font-serif text-xl md:text-2xl font-bold text-ink mb-2">{q}</p>
                <p className="text-ink/50 text-sm leading-relaxed tracking-wide">{a}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.4} className="mt-16">
          <p className="text-ink/60 text-sm md:text-base leading-[2.2] tracking-wide">
            身体を評価することで、
            <br />
            見えてくるものがあります。
            <br />
            <br />
            私たちは、症状そのものではなく
            <br />
            その背景にある原因に目を向けます。
          </p>
        </Reveal>
      </div>
    </section>
  );
}
