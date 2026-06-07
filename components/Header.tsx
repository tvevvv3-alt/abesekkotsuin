"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { label: "理念", href: "#philosophy" },
    { label: "アプローチ", href: "#approach" },
    { label: "スタッフ", href: "#staff" },
    { label: "料金", href: "#menu" },
    { label: "アクセス", href: "#access" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-[#050D18]/90 backdrop-blur-xl border-b border-gold/10"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex-shrink-0">
          <Image
            src="/logo.jpg"
            alt="阿部接骨院"
            width={180}
            height={43}
            className="h-9 w-auto object-contain"
            priority
          />
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs tracking-widest text-ink/60 hover:text-ink transition-colors duration-200"
            >
              {l.label}
            </a>
          ))}
        </nav>

        {/* LINE CTA */}
        <a
          href="https://line.me/R/ti/p/@abesekkotsuin"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-2 bg-[#06C755] text-white text-xs px-4 py-2 rounded font-medium tracking-wide hover:opacity-90 transition-opacity"
        >
          <LineIcon />
          LINE予約
        </a>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-ink/70 hover:text-ink"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="メニュー"
        >
          <span className="block w-6 h-px bg-current mb-1.5 transition-all" />
          <span className="block w-6 h-px bg-current mb-1.5 transition-all" />
          <span className="block w-4 h-px bg-current transition-all" />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-[#050D18]/95 backdrop-blur-xl border-t border-gold/10 px-6 py-6 flex flex-col gap-5"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm tracking-widest text-ink/70"
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a
            href="https://line.me/R/ti/p/@abesekkotsuin"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-line text-sm justify-center"
          >
            <LineIcon />
            LINE予約
          </a>
        </motion.div>
      )}
    </header>
  );
}

function LineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1C4.134 1 1 3.686 1 7c0 2.066 1.226 3.886 3.09 5.002L3.5 14.5l2.6-1.37C6.68 13.37 7.33 13.5 8 13.5c3.866 0 7-2.686 7-6s-3.134-6-7-6z"
        fill="currentColor"
      />
    </svg>
  );
}
