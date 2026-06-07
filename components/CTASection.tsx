"use client";

import { useEffect, useRef } from "react";

// Photo: 阿部院長の笑顔写真
// → public/photos/staff-abe.jpg に保存してください
const ABE_PHOTO = "/photos/staff-abe.jpg";

export default function CTASection() {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const img = new Image();
    img.src = ABE_PHOTO;
    img.onload = () => {
      if (bgRef.current) {
        bgRef.current.style.backgroundImage = `url('${ABE_PHOTO}')`;
      }
    };
  }, []);

  return (
    <section className="relative overflow-hidden mx-5 my-4 rounded-2xl">
      <div
        ref={bgRef}
        className="absolute inset-0 bg-cover bg-center bg-[#0A1828]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050D18]/98 via-[#050D18]/75 to-[#0D2040]/60" />

      <div className="relative z-10 px-7 py-12 text-center">
        <p className="font-bebas text-[9px] tracking-[0.35em] text-gold/40 mb-6">
          ABE SPORTS OSTEOPATHIC CLINIC
        </p>
        <div className="h-px w-8 bg-gold/40 mx-auto mb-7" />
        <h2
          className="font-serif font-bold text-ink leading-[1.5] mb-8"
          style={{ fontSize: "clamp(18px, 5.5vw, 24px)" }}
        >
          すべての人に、<br />
          <span className="text-gold/90">「ここに来てよかった」</span><br />
          と思える瞬間を。
        </h2>
        <a
          href="https://lin.ee/placeholder"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#06C755] text-white font-bold text-[13px] tracking-wide px-8 py-4 rounded-full active:scale-95 transition-transform"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.06 2 11.07c0 3.26 1.84 6.13 4.64 7.87L6 22l3.2-1.67C10.06 20.74 11 20.9 12 20.9 17.52 20.9 22 16.84 22 11.07 22 6.06 17.52 2 12 2zm0 16.6c-.88 0-1.74-.12-2.56-.35L7 19.28l.69-2.35A8.1 8.1 0 0 1 3.8 11.07C3.8 7.06 7.47 3.8 12 3.8s8.2 3.26 8.2 7.27-3.67 7.53-8.2 7.53z"/>
          </svg>
          LINE予約する
        </a>
        <p className="text-ink/20 text-[10px] mt-4 tracking-wide">
          完全予約制 · 24時間受付
        </p>
      </div>
    </section>
  );
}
