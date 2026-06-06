import CardCarousel from "../CardCarousel";

const problems = [
  {
    id: "p1",
    icon: "?",
    title: "何が原因か\nわからない",
    sub: "どこへ行っても改善しない。その理由を一緒に探します。",
  },
  {
    id: "p2",
    icon: "⏱",
    title: "試合まで\n時間がない",
    sub: "スポーツの現場を知っているから、焦りも理解できます。",
  },
  {
    id: "p3",
    icon: "🏥",
    title: "病院では\n様子を見てと言われた",
    sub: "「異常なし」でも痛みは続く。その痛みに向き合います。",
  },
  {
    id: "p4",
    icon: "🦵",
    title: "術後の\nリハビリが不安",
    sub: "手術後の回復を、段階に合わせてサポートします。",
  },
  {
    id: "p5",
    icon: "🔁",
    title: "同じ痛みを\n繰り返している",
    sub: "繰り返す痛みには、繰り返す理由があります。",
  },
];

export default function ProblemCards() {
  return (
    <CardCarousel
      sectionLabel="PROBLEM"
      sectionTitle="こんなお悩みは？"
      cards={problems.map((p) => ({
        id: p.id,
        content: (
          <div className="h-full min-h-[52vw] bg-[#0B1A30] border border-gold/15 rounded-2xl p-7 flex flex-col justify-between">
            <span className="text-3xl">{p.icon}</span>
            <div>
              <h3 className="font-serif text-xl font-bold text-ink leading-tight mb-3 whitespace-pre-line">
                {p.title}
              </h3>
              <p className="text-ink/50 text-xs leading-relaxed">{p.sub}</p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
