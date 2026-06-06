import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-[#030810] border-t border-gold/10 py-12 px-6">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
        <div>
          <Image
            src="/logo.jpg"
            alt="阿部接骨院"
            width={140}
            height={33}
            className="h-7 w-auto object-contain mb-4 opacity-80"
          />
          <p className="text-ink/25 text-xs tracking-widest font-bebas">
            TOTAL RECOVERYTATION ABE
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 text-xs text-ink/30">
          <div className="flex flex-col gap-2">
            <p className="text-gold/40 tracking-widest mb-1">IBARAKI</p>
            <p>大阪府茨木市真砂2−13−10</p>
            <p>072-665-8724</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-gold/40 tracking-widest mb-1">KAWANISHI</p>
            <p>兵庫県川西市鼓ヶ滝1−3−3</p>
            <p>シンリョーステイツ桜木304</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto mt-10 pt-6 border-t border-ink/5 flex flex-col md:flex-row justify-between items-center gap-2">
        <p className="text-ink/20 text-xs">
          © 2025 阿部接骨院. All rights reserved.
        </p>
        <a
          href="https://www.instagram.com/abesekkotsuin_ibaraki"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink/25 text-xs hover:text-ink/50 transition-colors"
        >
          @abesekkotsuin_ibaraki
        </a>
      </div>
    </footer>
  );
}
