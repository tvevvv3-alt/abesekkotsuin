import Reveal from "./Reveal";

const locations = [
  {
    name: "茨木本院",
    en: "IBARAKI MAIN",
    address: "大阪府茨木市真砂2−13−10",
    tel: "072-665-8724",
    parking: "駐車場3台",
    map: "https://maps.google.com/?q=34.7988626,135.5803611",
  },
  {
    name: "川西整体院",
    en: "KAWANISHI",
    address: "兵庫県川西市鼓ヶ滝1−3−3\nシンリョーステイツ桜木304",
    tel: "",
    parking: "",
    map: "https://maps.google.com/?q=川西市鼓ヶ滝1-3-3",
  },
];

export default function Access() {
  return (
    <section id="access" className="bg-navy py-24 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">ACCESS</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-ink mb-16">アクセス</h2>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-8">
          {locations.map((loc, i) => (
            <Reveal key={loc.en} delay={0.1 * i}>
              <div className="border-t-2 border-gold/30 pt-8">
                <p className="font-bebas text-xs tracking-[0.25em] text-gold/50 mb-2">{loc.en}</p>
                <h3 className="font-serif text-xl font-bold text-ink mb-6">{loc.name}</h3>

                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-gold/50 text-xs tracking-widest mb-1">ADDRESS</p>
                    <p className="text-ink/70 text-sm whitespace-pre-line leading-relaxed">
                      {loc.address}
                    </p>
                  </div>
                  {loc.tel && (
                    <div>
                      <p className="text-gold/50 text-xs tracking-widest mb-1">TEL</p>
                      <a
                        href={`tel:${loc.tel}`}
                        className="text-ink/70 text-sm hover:text-ink transition-colors"
                      >
                        {loc.tel}
                      </a>
                    </div>
                  )}
                  {loc.parking && (
                    <div>
                      <p className="text-gold/50 text-xs tracking-widest mb-1">PARKING</p>
                      <p className="text-ink/70 text-sm">{loc.parking}</p>
                    </div>
                  )}
                  <a
                    href={loc.map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost text-xs self-start mt-2"
                  >
                    Google マップで見る →
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
