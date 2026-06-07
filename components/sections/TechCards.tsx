import Image from "next/image";
import CardCarousel from "../CardCarousel";

const techs = [
  {
    id: "t1",
    name: "エコー観察装置",
    en: "ULTRASOUND ECHO",
    result: "痛みの原因を、目で見て確かめる。",
  },
  {
    id: "t2",
    name: "アキュスコープ",
    en: "ACUSCOPE",
    result: "細胞レベルから、回復を後押しする。",
  },
  {
    id: "t3",
    name: "マイオパルス",
    en: "MYOPULSE",
    result: "硬くなった組織を、ほぐしていく。",
  },
  {
    id: "t4",
    name: "エレサス",
    en: "ELESUS",
    result: "深部の痛みに、直接届かせる。",
  },
  {
    id: "t5",
    name: "ハイチャージNEO",
    en: "HIGH CHARGE NEO",
    result: "全身の電気的バランスを、整える。",
  },
];

export default function TechCards() {
  return (
    <CardCarousel
      sectionLabel="04 · TECHNOLOGY"
      sectionTitle="その考え方を支える技術"
      cards={[
        // First card: equipment photo with overlay
        {
          id: "t0",
          content: (
            <div className="relative h-[68vw] rounded-2xl overflow-hidden">
              <Image
                src="/equipment.jpg"
                alt="機器"
                fill
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-[#050D18]/70 via-[#050D18]/40 to-[#050D18]/80" />
              <div className="absolute inset-0 flex flex-col justify-end p-7">
                <div className="h-px w-8 bg-gold/50 mb-5" />
                <p
                  className="font-serif font-bold text-ink leading-[1.25] mb-2"
                  style={{ fontSize: "clamp(18px, 5vw, 22px)" }}
                >
                  機器は、手段です。
                </p>
                <p className="text-ink/45 text-[11px] leading-relaxed">
                  最新機器を揃えているから良いのではなく、
                  <br />
                  あなたの回復に必要なものを選んで使います。
                </p>
              </div>
            </div>
          ),
        },
        ...techs.map((t) => ({
          id: t.id,
          content: (
            <div className="relative h-[68vw] bg-[#0A1828] border border-gold/8 rounded-2xl overflow-hidden flex flex-col justify-end p-7">
              <div className="absolute top-6 left-7">
                <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/40">{t.en}</p>
              </div>
              <div className="h-px w-8 bg-gold/40 mb-5" />
              <h3
                className="font-serif font-bold text-ink leading-tight mb-3"
                style={{ fontSize: "clamp(19px, 5.5vw, 24px)" }}
              >
                {t.name}
              </h3>
              <p className="text-ink/40 text-[11px] leading-relaxed">{t.result}</p>
            </div>
          ),
        })),
      ]}
    />
  );
}
