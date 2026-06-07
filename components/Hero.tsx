"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden bg-navy-dark">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-bg.jpg"
          alt=""
          fill
          className="object-cover object-center opacity-20"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050D18]/60 via-[#050D18]/30 to-[#050D18]" />
      </div>

      {/* Ambient ring */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <div className="w-[600px] h-[600px] rounded-full border border-gold/5 opacity-60" />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-gold/8" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 pt-28 pb-24 flex flex-col items-start md:items-center text-left md:text-center">
        {/* Label */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="font-bebas text-xs tracking-[0.3em] text-gold/70 mb-8"
        >
          SPORTS OSTEOPATHIC CLINIC · IBARAKI · KAWANISHI
        </motion.p>

        {/* Main copy */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="font-serif text-4xl md:text-5xl lg:text-6xl font-black text-ink leading-[1.25] tracking-tight mb-6"
        >
          もう無理かもしれない。
          <br />
          <span className="text-2xl md:text-3xl lg:text-4xl font-light text-ink/80 leading-relaxed">
            そう思ったときに、
            <br />
            思い出してもらえる場所でありたい。
          </span>
        </motion.h1>

        <div className="divider-gold w-16 mb-8" />

        {/* Sub copy */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="text-sm md:text-base text-ink/55 leading-[2] tracking-wide mb-12 max-w-xl"
        >
          スポーツのケガ。長引く痛み。術後のリハビリ。
          <br />
          私たちは症状だけでなく、
          <br />
          その背景にある原因まで丁寧に評価します。
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.0 }}
          className="flex flex-col sm:flex-row items-start md:items-center gap-4"
        >
          <a
            href="https://line.me/R/ti/p/@abesekkotsuin"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-line font-sans"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1C4.134 1 1 3.686 1 7c0 2.066 1.226 3.886 3.09 5.002L3.5 14.5l2.6-1.37C6.68 13.37 7.33 13.5 8 13.5c3.866 0 7-2.686 7-6s-3.134-6-7-6z"
                fill="currentColor"
              />
            </svg>
            LINE で予約する
          </a>
          <a href="#philosophy" className="btn-ghost font-sans">
            詳しく見る
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] tracking-[0.3em] text-ink/30">SCROLL</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            className="w-px h-8 bg-gradient-to-b from-gold/40 to-transparent"
          />
        </motion.div>
      </div>
    </section>
  );
}
