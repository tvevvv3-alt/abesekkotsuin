"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function HeroSection() {
  return (
    <section className="relative h-[100svh] flex flex-col justify-end overflow-hidden bg-navy-dark">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-bg.jpg"
          alt=""
          fill
          className="object-cover object-center opacity-25"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050D18]/30 via-transparent to-[#050D18]" />
      </div>

      {/* Ambient rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[380px] h-[380px] rounded-full border border-gold/6" />
        <div className="absolute w-[260px] h-[260px] rounded-full border border-gold/10" />
      </div>

      {/* Content — bottom aligned */}
      <div className="relative z-10 px-6 pb-10 pt-24">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="font-bebas text-[10px] tracking-[0.3em] text-gold/70 mb-5"
        >
          SPORTS OSTEOPATHIC CLINIC · IBARAKI · KAWANISHI
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="font-serif font-black text-ink leading-[1.25] mb-5"
          style={{ fontSize: "clamp(28px, 8vw, 40px)" }}
        >
          もう無理かもしれない。
          <br />
          <span className="font-light text-ink/75" style={{ fontSize: "clamp(18px, 5vw, 24px)" }}>
            そう思ったときに、思い出してもらえる
            <br />
            場所でありたい。
          </span>
        </motion.h1>

        <div className="h-px w-12 bg-gradient-to-r from-gold/50 to-transparent mb-5" />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          className="text-ink/50 text-xs leading-[2] tracking-wide"
        >
          スポーツのケガ。長引く痛み。術後のリハビリ。<br />
          症状の背景にある原因まで、丁寧に評価します。
        </motion.p>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="flex items-center gap-2 mt-8"
        >
          <motion.div
            animate={{ x: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
            className="text-gold/40 text-xs tracking-widest"
          >
            スワイプして見る →
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
