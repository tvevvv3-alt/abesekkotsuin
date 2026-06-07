"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

// Hero photo: 肩可動域評価写真（腕を横から上げている写真）
// → public/photos/hero.jpg に保存してください
const HERO_PHOTO = "/photos/hero.jpg";

export default function HeroSection() {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Test if photo exists; if not, show gradient-only fallback
    const img = new Image();
    img.src = HERO_PHOTO;
    img.onload = () => {
      if (bgRef.current) {
        bgRef.current.style.backgroundImage = `url('${HERO_PHOTO}')`;
        bgRef.current.style.opacity = "0.42";
      }
    };
  }, []);

  return (
    <section className="relative h-[100svh] flex flex-col justify-end overflow-hidden bg-navy-dark">
      {/* Background photo — loads if file exists, silent fallback if not */}
      <div
        ref={bgRef}
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-0 transition-opacity duration-700"
      />
      {/* Atmospheric gradient overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#050D18]/60 via-[#050D18]/20 to-[#050D18]" />
      {/* Extra depth at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-2/3 z-0 bg-gradient-to-t from-[#050D18] via-[#050D18]/70 to-transparent" />

      {/* Ambient gold lines — always visible */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[30%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/8 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 px-7 pb-12 pt-24">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.45, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="font-bebas text-[10px] tracking-[0.35em] text-gold mb-7"
        >
          SPORTS OSTEOPATHIC CLINIC · IBARAKI · KAWANISHI
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif font-bold text-ink leading-[1.2] mb-6"
          style={{ fontSize: "clamp(30px, 9vw, 46px)" }}
        >
          ここに来てよかった。
          <br />
          その瞬間のために。
        </motion.h1>

        <motion.div
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, delay: 1.2 }}
          className="h-px w-10 bg-gold/50 mb-7"
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.35 }}
          className="text-ink/45 text-[13px] leading-[2.1] tracking-wide"
        >
          スポーツのケガ。長引く痛み。術後のリハビリ。<br />
          症状だけでなく、その背景にある原因まで<br />
          丁寧に評価します。
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
          className="mt-10"
        >
          <motion.span
            animate={{ x: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            className="text-gold/35 text-[10px] tracking-[0.25em] font-bebas"
          >
            SWIPE TO EXPLORE →
          </motion.span>
        </motion.div>
      </div>
    </section>
  );
}
