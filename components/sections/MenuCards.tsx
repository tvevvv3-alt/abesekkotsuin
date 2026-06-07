import CardCarousel from "../CardCarousel";

const menus = [
  {
    id: "m1",
    name: "初診",
    price: "7,000円",
    note: "評価・施術含む",
    desc: "はじめての方向け。お身体の状態を丁寧にお伺いし、評価・施術を行います。",
  },
  {
    id: "m2",
    name: "再診",
    price: "5,000円",
    note: "",
    desc: "2回目以降の施術。前回の経過を確認しながら継続的にアプローチします。",
  },
  {
    id: "m3",
    name: "学生",
    price: "4,000円",
    note: "高校生以下",
    desc: "部活動や競技に励む学生さんを応援。ケガの早期回復をサポートします。",
  },
  {
    id: "m4",
    name: "全身通電",
    price: "3,000円",
    note: "ハイチャージNEO",
    desc: "全身の電気的バランスを整える通電療法。疲労回復・コンディショニングに。",
  },
  {
    id: "m5",
    name: "体幹教室",
    price: "3,000円",
    note: "1回・グループ",
    desc: "インナーマッスルを鍛え、再発しない身体へ。グループで楽しく行います。",
  },
  {
    id: "m6",
    name: "パーソナル\nトレーニング",
    price: "6,000円",
    note: "1回・マンツーマン",
    desc: "個別の目標に合わせたマンツーマン指導。LINEにてご相談ください。",
  },
];

export default function MenuCards() {
  return (
    <CardCarousel
      sectionLabel="07 · MENU & PRICE"
      sectionTitle="施術メニュー・料金"
      cards={menus.map((m) => ({
        id: m.id,
        content: (
          <div className="relative h-[60vw] bg-[#0A1828] border border-gold/8 rounded-2xl overflow-hidden flex flex-col justify-between p-7">
            {/* Top: name + note + desc */}
            <div>
              <h3
                className="font-serif font-bold text-ink leading-tight mb-1 whitespace-pre-line"
                style={{ fontSize: "clamp(22px, 6.5vw, 28px)" }}
              >
                {m.name}
              </h3>
              {m.note && (
                <p className="text-ink/25 text-[10px] tracking-wide mb-3">{m.note}</p>
              )}
              <p className="text-ink/40 text-[11px] leading-relaxed">{m.desc}</p>
            </div>
            {/* Bottom: price */}
            <div className="border-t border-gold/10 pt-4">
              <p className="font-bebas text-[9px] tracking-[0.2em] text-gold/40 mb-1">
                PRICE（税込）
              </p>
              <p
                className="font-serif font-bold text-gold leading-none"
                style={{ fontSize: "clamp(26px, 7vw, 32px)" }}
              >
                {m.price}
              </p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
