"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function HeroSection() {
  return (
    <section className="relative h-[100svh] flex flex-col justify-end overflow-hidden bg-navy-dark">
      {/* Background photo */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-bg.jpg"
          alt=""
          fill
          className="object-cover object-center opacity-35"
          priority
        />
        {/* Cinematic gradient - strong at bottom */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050D18]/50 via-transparent to-[#050D18]" />
        <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-[#050D18] via-[#050D18]/60 to-transparent" />
      </div>

      {/* Content — bottom aligned */}
      <div className="relative z-10 px-7 pb-12 pt-24">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 0.5, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="font-bebas text-[10px] tracking-[0.35em] text-gold mb-6"
        >
          SPORTS OSTEOPATHIC CLINIC · IBARAKI · KAWANISHI
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif font-bold text-ink leading-[1.2] mb-6"
          style={{ fontSize: "clamp(30px, 9vw, 44px)" }}
        >
          ここに来てよかった。
          <br />
          その瞬間のために。
        </motion.h1>

        <motion.div
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="h-px w-10 bg-gold/50 mb-6"
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.35 }}
          className="text-ink/45 text-[13px] leading-[2] tracking-wide"
        >
          スポーツのケガ。長引く痛み。術後のリハビリ。<br />
          症状だけでなく、その背景にある原因まで<br />
          丁寧に評価します。
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
          className="mt-10 flex items-center gap-2"
        >
          <motion.span
            animate={{ x: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            className="text-gold/40 text-[11px] tracking-[0.2em] font-bebas"
          >
            SWIPE TO EXPLORE →
          </motion.span>
        </motion.div>
      </div>
    </section>
  );
}
