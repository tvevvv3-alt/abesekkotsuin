import Reveal from "./Reveal";

const items = [
  { name: "初診", price: "¥2,500〜", note: "評価・施術含む" },
  { name: "再診", price: "¥2,000〜", note: "" },
  { name: "学生", price: "¥1,500〜", note: "高校生以下" },
  { name: "全身通電", price: "¥2,000", note: "ハイチャージNEO" },
  { name: "体幹教室", price: "¥3,000", note: "グループ" },
  { name: "パーソナル", price: "お問い合わせ", note: "マンツーマン" },
];

const hours = [
  { day: "平日", time: "10:00 〜 13:00 / 16:00 〜 20:30" },
  { day: "土曜", time: "10:00 〜 13:00" },
  { day: "日・祝", time: "休診" },
];

export default function MenuSection() {
  return (
    <section id="menu" className="bg-navy-dark py-24 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 md:gap-24">
          {/* Menu */}
          <div>
            <Reveal>
              <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">MENU</p>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="font-serif text-2xl font-bold text-ink mb-10">施術メニュー</h2>
            </Reveal>
            <div className="flex flex-col gap-0">
              {items.map((item, i) => (
                <Reveal key={item.name} delay={0.06 * i}>
                  <div className="flex justify-between items-baseline py-4 border-b border-ink/8">
                    <div>
                      <span className="text-ink/80 text-sm">{item.name}</span>
                      {item.note && (
                        <span className="text-ink/30 text-xs ml-2">{item.note}</span>
                      )}
                    </div>
                    <span className="font-serif text-ink/70 text-sm">{item.price}</span>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.4}>
              <p className="text-ink/30 text-xs mt-4 leading-relaxed">
                ※保険診療は取り扱いにより異なります。詳細はLINEにてお問い合わせください。
              </p>
            </Reveal>
          </div>

          {/* Hours */}
          <div>
            <Reveal>
              <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">HOURS</p>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="font-serif text-2xl font-bold text-ink mb-10">診療時間</h2>
            </Reveal>
            <div className="flex flex-col gap-0">
              {hours.map((h, i) => (
                <Reveal key={h.day} delay={0.08 * i}>
                  <div className="flex justify-between items-baseline py-4 border-b border-ink/8">
                    <span className="text-ink/50 text-sm w-16">{h.day}</span>
                    <span className="text-ink/75 text-sm">{h.time}</span>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.3} className="mt-8">
              <p className="text-ink/40 text-sm leading-relaxed">
                完全予約制
                <br />
                <span className="text-gold/60">LINE · 24時間受付</span>
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
