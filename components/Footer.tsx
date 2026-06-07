import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-[#030810] border-t border-gold/8 pt-12 pb-6 px-7">
      {/* Emotional closing statement */}
      <div className="mb-10">
        <p className="font-serif text-ink/70 text-base leading-[1.8] mb-1">
          すべての人に、
        </p>
        <p className="font-serif text-ink/70 text-base leading-[1.8]">
          「ここに来てよかった」と思える瞬間を。
        </p>
        <p className="text-ink/25 text-[11px] leading-relaxed mt-4">
          身体の不調やスポーツのケガで悩んだとき、<br />
          まずはお気軽にご相談ください。
        </p>
      </div>

      {/* Logo */}
      <div className="mb-8">
        <Image
          src="/logo.jpg"
          alt="阿部接骨院"
          width={130}
          height={31}
          className="h-7 w-auto object-contain opacity-60"
        />
      </div>

      {/* Clinic info */}
      <div className="flex flex-col gap-5 text-[11px] text-ink/25 mb-8">
        <div>
          <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/30 mb-1.5">IBARAKI</p>
          <p>大阪府茨木市真砂2−13−10</p>
          <p>072-665-8724</p>
        </div>
        <div>
          <p className="font-bebas text-[9px] tracking-[0.3em] text-gold/30 mb-1.5">KAWANISHI</p>
          <p>兵庫県川西市鼓ヶ滝1−3−3</p>
          <p>シンリョーステイツ桜木304</p>
        </div>
      </div>

      {/* Bottom */}
      <div className="pt-5 border-t border-ink/5 flex flex-col gap-2">
        <a
          href="https://www.instagram.com/abesekkotsuin_ibaraki"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink/20 text-[10px] hover:text-ink/40 transition-colors"
        >
          @abesekkotsuin_ibaraki
        </a>
        <p className="text-ink/15 text-[10px]">
          © 2025 阿部接骨院. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
