import Reveal from "./Reveal";

const voices = [
  {
    text: "原因がわかった",
    sub: "何年も悩んでいたのに、初回の評価で「なるほど」と思えた。",
    tag: "20代・アスリート",
  },
  {
    text: "もっと早く来ればよかった",
    sub: "他院をいくつか転々としていたが、ここで変化を実感できた。",
    tag: "30代・会社員",
  },
  {
    text: "痛みがかなり楽になった",
    sub: "試合前に来院。間に合うか不安だったが、練習に戻れた。",
    tag: "高校生・部活動",
  },
];

export default function Voice() {
  return (
    <section className="bg-navy-dark py-24 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">VOICE</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-ink mb-4">
            患者さんの声
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="text-ink/40 text-xs tracking-wide mb-16">
            ※個人の感想です。効果には個人差があります。
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {voices.map((v, i) => (
            <Reveal key={v.text} delay={0.1 * i}>
              <div className="border border-gold/15 rounded-sm p-8 hover:border-gold/30 transition-colors duration-500">
                <p className="text-gold/50 text-3xl font-serif mb-4 leading-none">&ldquo;</p>
                <p className="font-serif text-lg font-bold text-ink mb-3">{v.text}</p>
                <p className="text-ink/50 text-sm leading-relaxed mb-6">{v.sub}</p>
                <p className="text-gold/60 text-xs tracking-widest font-bebas">{v.tag}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
