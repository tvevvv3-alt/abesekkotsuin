export default function AccessSection() {
  return (
    <section className="px-5 pt-6 pb-4">
      <p className="font-bebas text-[10px] tracking-[0.3em] text-gold/60 mb-1">ACCESS</p>
      <h2 className="font-serif text-lg font-bold text-ink mb-5">アクセス</h2>

      <div className="flex flex-col gap-4">
        {/* Ibaraki */}
        <div className="bg-[#0B1A30] border-t-2 border-gold/40 rounded-xl p-5">
          <p className="font-bebas text-[10px] tracking-[0.25em] text-gold/50 mb-1">IBARAKI MAIN</p>
          <h3 className="font-serif text-base font-bold text-ink mb-3">茨木本院</h3>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex gap-3">
              <span className="text-gold/40 tracking-widest w-14 flex-shrink-0">住所</span>
              <span className="text-ink/70">大阪府茨木市真砂2−13−10</span>
            </div>
            <div className="flex gap-3">
              <span className="text-gold/40 tracking-widest w-14 flex-shrink-0">TEL</span>
              <a href="tel:072-665-8724" className="text-ink/70">072-665-8724</a>
            </div>
            <div className="flex gap-3">
              <span className="text-gold/40 tracking-widest w-14 flex-shrink-0">駐車場</span>
              <span className="text-ink/70">3台あり</span>
            </div>
            <div className="flex gap-3">
              <span className="text-gold/40 tracking-widest w-14 flex-shrink-0">平日</span>
              <span className="text-ink/70">10:00〜13:00 / 16:00〜20:30</span>
            </div>
            <div className="flex gap-3">
              <span className="text-gold/40 tracking-widest w-14 flex-shrink-0">土曜</span>
              <span className="text-ink/70">10:00〜13:00</span>
            </div>
            <div className="flex gap-3">
              <span className="text-gold/40 tracking-widest w-14 flex-shrink-0">日・祝</span>
              <span className="text-ink/40">休診</span>
            </div>
          </div>
          <a
            href="https://maps.google.com/?q=34.7988626,135.5803611"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-gold/60 text-xs border border-gold/20 rounded-lg px-3 py-1.5 hover:border-gold/40 transition-colors"
          >
            Google マップ →
          </a>
        </div>

        {/* Kawanishi */}
        <div className="bg-[#0B1A30] border-t-2 border-gold/20 rounded-xl p-5">
          <p className="font-bebas text-[10px] tracking-[0.25em] text-gold/50 mb-1">KAWANISHI</p>
          <h3 className="font-serif text-base font-bold text-ink mb-3">川西整体院</h3>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex gap-3">
              <span className="text-gold/40 tracking-widest w-14 flex-shrink-0">住所</span>
              <span className="text-ink/70">兵庫県川西市鼓ヶ滝1−3−3<br />シンリョーステイツ桜木304</span>
            </div>
          </div>
          <a
            href="https://maps.google.com/?q=川西市鼓ヶ滝1-3-3"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-gold/60 text-xs border border-gold/20 rounded-lg px-3 py-1.5 hover:border-gold/40 transition-colors"
          >
            Google マップ →
          </a>
        </div>

        <p className="text-center text-ink/30 text-xs mt-1">
          完全予約制 · LINE 24時間受付
        </p>
      </div>
    </section>
  );
}
