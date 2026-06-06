import Reveal from "./Reveal";

export default function FinalCTA() {
  return (
    <section className="relative bg-navy-dark py-32 md:py-56 px-6 overflow-hidden">
      {/* Radial gold spotlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gold/4 blur-[140px] pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-8">
            ABE SEKKOTSUIN
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="font-serif text-3xl md:text-5xl font-black text-ink leading-[1.3] mb-8">
            すべての人に、
            <br />
            「ここに来てよかった」と
            <br />
            思える瞬間を。
          </h2>
        </Reveal>

        <div className="divider-gold w-12 mx-auto mb-10" />

        <Reveal delay={0.25}>
          <p className="text-ink/50 text-sm leading-[2.2] tracking-wide mb-12">
            身体の不調やスポーツのケガで悩んだとき、
            <br />
            まずはお気軽にご相談ください。
            <br />
            完全予約制 · LINE 24時間受付
          </p>
        </Reveal>

        <Reveal delay={0.35}>
          <a
            href="https://line.me/R/ti/p/@abesekkotsuin"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-line text-base px-10 py-4 inline-flex"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" className="mr-2">
              <path
                d="M8 1C4.134 1 1 3.686 1 7c0 2.066 1.226 3.886 3.09 5.002L3.5 14.5l2.6-1.37C6.68 13.37 7.33 13.5 8 13.5c3.866 0 7-2.686 7-6s-3.134-6-7-6z"
                fill="currentColor"
              />
            </svg>
            LINE で予約・相談する
          </a>
        </Reveal>
      </div>
    </section>
  );
}
