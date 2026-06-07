import CardCarousel from "../CardCarousel";

const problems = [
  {
    id: "p1",
    num: "01",
    title: "原因が\nわからない",
    sub: "レントゲンでは\n異常なしと言われた",
  },
  {
    id: "p2",
    num: "02",
    title: "試合まで\n時間がない",
    sub: "あと2週間で\n大会がある",
  },
  {
    id: "p3",
    num: "03",
    title: "様子を見てと\n言われた",
    sub: "病院では様子を見てと\n言われた",
  },
  {
    id: "p4",
    num: "04",
    title: "術後の\nリハビリが不安",
    sub: "リハビリがうまく\n進むか心配",
  },
  {
    id: "p5",
    num: "05",
    title: "同じ痛みを\n繰り返している",
    sub: "一度良くなっても\nまた痛くなる",
  },
];

export default function ProblemCards() {
  return (
    <CardCarousel
      sectionLabel="02 · PROBLEM"
      sectionTitle="こんなお悩みは？"
      cards={problems.map((p) => ({
        id: p.id,
        content: (
          <div className="relative h-[68vw] bg-[#0A1828] border border-gold/8 rounded-2xl overflow-hidden flex flex-col justify-end p-7">
            {/* Background number */}
            <span
              className="absolute top-5 right-5 font-bebas leading-none select-none text-gold/6"
              style={{ fontSize: "clamp(80px, 22vw, 110px)" }}
            >
              {p.num}
            </span>
            {/* Gold accent line */}
            <div className="h-px w-8 bg-gold/50 mb-5" />
            {/* Headline */}
            <h3
              className="font-serif font-bold text-ink leading-[1.2] mb-3 whitespace-pre-line"
              style={{ fontSize: "clamp(22px, 6vw, 28px)" }}
            >
              {p.title}
            </h3>
            {/* Sub */}
            <p className="text-ink/35 text-[11px] leading-relaxed tracking-wide whitespace-pre-line">
              {p.sub}
            </p>
          </div>
        ),
      }))}
    />
  );
}
