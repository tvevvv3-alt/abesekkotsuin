import Image from "next/image";
import Reveal from "./Reveal";

const techs = [
  {
    name: "エコー観察装置",
    en: "ULTRASOUND ECHO",
    purpose: "筋肉・腱・靭帯の状態をリアルタイムで可視化。見えない原因を、見える化します。",
  },
  {
    name: "アキュスコープ",
    en: "ACUSCOPE",
    purpose: "微弱電流で細胞レベルの回復を促進。痛みの原因となる炎症を内側から鎮めます。",
  },
  {
    name: "マイオパルス",
    en: "MYOPULSE",
    purpose: "筋膜・結合組織に直接アプローチ。硬くなった組織をほぐし、動きの質を高めます。",
  },
  {
    name: "エレサス",
    en: "ELESUS",
    purpose: "ハイボルテージ刺激で深部の痛みにアプローチ。急性期から回復期まで対応します。",
  },
  {
    name: "ハイチャージNEO",
    en: "HIGH CHARGE NEO",
    purpose: "全身の電気的バランスを整える通電療法。疲労回復と身体機能の最適化に活用します。",
  },
];

export default function Technology() {
  return (
    <section className="bg-navy py-24 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <Reveal>
          <p className="font-bebas text-xs tracking-[0.3em] text-gold/60 mb-4">TECHNOLOGY</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="font-serif text-2xl md:text-3xl font-bold text-ink mb-4 leading-relaxed">
            その考え方を支える技術
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="text-ink/50 text-sm leading-[2] tracking-wide mb-16 max-w-xl">
            機器はあくまで手段です。
            <br />
            患者さんの身体に必要なアプローチを選ぶために、
            幅広い選択肢を揃えています。
          </p>
        </Reveal>

        {/* Equipment photo */}
        <Reveal delay={0.2} className="mb-16">
          <div className="relative overflow-hidden rounded-sm aspect-[16/9] md:aspect-[21/9]">
            <Image
              src="/equipment.jpg"
              alt="院内設備"
              fill
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-8">
              <p className="font-serif text-lg md:text-2xl font-bold text-ink">
                本気で治すために、
                <br />
                すべてを揃えています。
              </p>
              <p className="text-gold/70 text-sm mt-2 tracking-wide">再び動ける身体へ。</p>
            </div>
          </div>
        </Reveal>

        {/* Tech list */}
        <div className="flex flex-col gap-0">
          {techs.map((t, i) => (
            <Reveal key={t.name} delay={0.07 * i}>
              <div className="py-6 border-b border-ink/8 grid md:grid-cols-[200px_1fr] gap-4 items-start group">
                <div>
                  <p className="font-serif text-base font-bold text-ink group-hover:text-gold transition-colors duration-300">
                    {t.name}
                  </p>
                  <p className="font-bebas text-xs tracking-[0.2em] text-gold/40 mt-1">{t.en}</p>
                </div>
                <p className="text-ink/50 text-sm leading-relaxed">{t.purpose}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
