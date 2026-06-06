import CardCarousel from "../CardCarousel";

const menus = [
  {
    id: "m1",
    name: "初診",
    price: "¥2,500〜",
    note: "評価・施術含む",
    desc: "はじめての方向け。お身体の状態を丁寧にお伺いし、評価・施術を行います。",
  },
  {
    id: "m2",
    name: "再診",
    price: "¥2,000〜",
    note: "",
    desc: "2回目以降の施術。前回の経過を確認しながら継続的にアプローチします。",
  },
  {
    id: "m3",
    name: "学生",
    price: "¥1,500〜",
    note: "高校生以下",
    desc: "部活動や競技に励む学生さんを応援。ケガの早期回復をサポートします。",
  },
  {
    id: "m4",
    name: "全身通電",
    price: "¥2,000",
    note: "ハイチャージNEO",
    desc: "全身の電気的バランスを整える通電療法。疲労回復・コンディショニングに。",
  },
  {
    id: "m5",
    name: "体幹教室",
    price: "¥3,000",
    note: "グループ",
    desc: "インナーマッスルを鍛え、再発しない身体へ。グループで楽しく行います。",
  },
  {
    id: "m6",
    name: "パーソナル",
    price: "お問い合わせ",
    note: "マンツーマン",
    desc: "個別の目標に合わせたマンツーマン指導。LINEにてご相談ください。",
  },
];

export default function MenuCards() {
  return (
    <CardCarousel
      sectionLabel="MENU & PRICE"
      sectionTitle="施術メニュー・料金"
      cards={menus.map((m) => ({
        id: m.id,
        content: (
          <div className="h-full min-h-[52vw] bg-[#0B1A30] border border-gold/12 rounded-2xl p-7 flex flex-col justify-between">
            <div>
              <h3 className="font-serif text-2xl font-bold text-ink mb-1">{m.name}</h3>
              {m.note && <p className="text-ink/30 text-xs mb-4">{m.note}</p>}
              <p className="text-ink/50 text-xs leading-relaxed">{m.desc}</p>
            </div>
            <div className="border-t border-gold/15 pt-4 mt-4">
              <p className="font-bebas text-[10px] tracking-[0.2em] text-gold/40 mb-1">PRICE</p>
              <p className="font-serif text-2xl font-bold text-gold">{m.price}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
