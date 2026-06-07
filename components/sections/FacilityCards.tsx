// Photos needed in public/photos/:
//   facility-waiting.jpg   — 待合室（チームバナーあり）
//   facility-interior.jpg  — 院内全景・治療スペース
//   facility-reception.jpg — 受付カウンター
//   facility-exterior.jpg  — 外観・入口

import CardCarousel from "../CardCarousel";

const cards = [
  {
    id: "fc1",
    photo: "/photos/facility-waiting.jpg",
    en: "WAITING ROOM",
    title: "待合室",
    sub: "スポーツチームの横断幕に囲まれた空間。来院されるすべての方が、落ち着いて待てる場所を用意しています。",
  },
  {
    id: "fc2",
    photo: "/photos/facility-interior.jpg",
    en: "TREATMENT SPACE",
    title: "治療スペース",
    sub: "評価から施術まで、一つひとつ丁寧に。清潔で落ち着いた環境を整えています。",
  },
  {
    id: "fc3",
    photo: "/photos/facility-reception.jpg",
    en: "RECEPTION",
    title: "受付",
    sub: "お困りのことはお気軽にご相談ください。LINE予約も24時間受付しています。",
  },
  {
    id: "fc4",
    photo: "/photos/facility-exterior.jpg",
    en: "EXTERIOR",
    title: "外観・入口",
    sub: "茨木市真砂。お車でお越しの方は駐車場（3台）をご利用ください。",
  },
];

export default function FacilityCards() {
  return (
    <CardCarousel
      sectionLabel="09 · FACILITY"
      sectionTitle="院内紹介"
      cards={cards.map((c) => ({
        id: c.id,
        content: (
          <div className="relative h-[68vw] rounded-2xl overflow-hidden flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${c.photo}')` }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050D18]/96 via-[#050D18]/50 to-[#050D18]/15" />
            <div className="relative z-10 p-7">
              <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/40 mb-3">{c.en}</p>
              <h3
                className="font-serif font-bold text-ink leading-tight mb-2"
                style={{ fontSize: "clamp(19px, 5.5vw, 24px)" }}
              >
                {c.title}
              </h3>
              <p className="text-ink/40 text-[11px] leading-relaxed">{c.sub}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
