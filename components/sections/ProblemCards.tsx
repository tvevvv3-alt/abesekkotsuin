// Photos needed in public/photos/:
//   eval-shoulder.jpg — 肩可動域評価（腕を横から上げている写真）
//   eval-run.jpg      — アダプベース評価（ランニング）
//   Others: dark gradient fallback

import CardCarousel from "../CardCarousel";

// Each card optionally has a photo path
const problems = [
  {
    id: "p1",
    num: "01",
    photo: "/photos/eval-shoulder.jpg",
    title: "原因が\nわからない",
    sub: "レントゲンでは\n異常なしと言われた",
  },
  {
    id: "p2",
    num: "02",
    photo: null,
    title: "試合まで\n時間がない",
    sub: "あと2週間で\n大会がある",
  },
  {
    id: "p3",
    num: "03",
    photo: null,
    title: "様子を見てと\n言われた",
    sub: "病院では様子を見てと\n言われた",
  },
  {
    id: "p4",
    num: "04",
    photo: "/photos/eval-run.jpg",
    title: "術後の\nリハビリが不安",
    sub: "リハビリがうまく\n進むか心配",
  },
  {
    id: "p5",
    num: "05",
    photo: null,
    title: "同じ痛みを\n繰り返している",
    sub: "一度良くなっても\nまた痛くなる",
  },
  {
    id: "p6",
    num: "06",
    photo: null,
    title: "どこへ行っても\n変わらなかった",
    sub: "他の院では\n改善しなかった",
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
          <div className="relative h-[68vw] rounded-2xl overflow-hidden flex flex-col justify-end">
            {/* Photo background — silent fallback if file missing */}
            {p.photo && (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${p.photo}')` }}
              />
            )}
            {/* Overlay — stronger when no photo */}
            <div className={`absolute inset-0 ${
              p.photo
                ? "bg-gradient-to-t from-[#050D18]/95 via-[#050D18]/50 to-[#050D18]/20"
                : "bg-gradient-to-br from-[#0B1E38] to-[#060E1A]"
            }`} />
            {/* Background number */}
            <span
              className="absolute top-5 right-5 font-bebas leading-none select-none text-gold/8"
              style={{ fontSize: "clamp(72px, 20vw, 100px)" }}
            >
              {p.num}
            </span>
            {/* Content */}
            <div className="relative z-10 p-7">
              <div className="h-px w-8 bg-gold/50 mb-4" />
              <h3
                className="font-serif font-bold text-ink leading-[1.2] mb-2.5 whitespace-pre-line"
                style={{ fontSize: "clamp(20px, 5.5vw, 26px)" }}
              >
                {p.title}
              </h3>
              <p className="text-ink/40 text-[11px] leading-relaxed tracking-wide whitespace-pre-line">
                {p.sub}
              </p>
            </div>
          </div>
        ),
      }))}
    />
  );
}
