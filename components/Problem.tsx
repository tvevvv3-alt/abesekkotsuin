import Reveal from "./Reveal";

const problems = [
  "何が原因かわからない",
  "試合まで時間がない",
  "病院では「様子を見て」と言われた",
  "術後のリハビリが不安",
  "同じ痛みを繰り返している",
  "どこへ行っても変わらなかった",
];

export default function Problem() {
  return (
    <section className="bg-navy py-24 md:py-36 px-6">
      <div className="max-w-3xl mx-auto">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">PROBLEM</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-ink mb-16 leading-relaxed">
            こんなお悩みは
            <br />
            ありませんか？
          </h2>
        </Reveal>

        <div className="flex flex-col gap-0">
          {problems.map((p, i) => (
            <Reveal key={p} delay={0.08 * i}>
              <div className="flex items-center gap-4 py-5 border-b border-ink/8 group">
                <span className="text-gold/40 font-bebas text-sm tracking-wider w-6 flex-shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-ink/70 text-sm md:text-base tracking-wide group-hover:text-ink transition-colors duration-300">
                  {p}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.5} className="mt-16">
          <p className="text-ink/40 text-sm leading-[2] tracking-wide border-l-2 border-gold/30 pl-5">
            どこへ行けばいいかわからない。
            <br />
            そんな方こそ、一度ご相談ください。
          </p>
        </Reveal>
      </div>
    </section>
  );
}
