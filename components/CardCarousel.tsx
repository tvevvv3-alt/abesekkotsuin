"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface CardProps {
  id: string;
  content: React.ReactNode;
}

interface Props {
  cards: CardProps[];
  sectionLabel?: string;
  sectionTitle?: string;
  className?: string;
}

export default function CardCarousel({ cards, sectionLabel, sectionTitle, className = "" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || cards.length === 0) return;
    const cardWidth = el.scrollWidth / cards.length;
    const idx = Math.min(cards.length - 1, Math.round(el.scrollLeft / cardWidth));
    setActive(idx);
  }, [cards.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const goTo = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / cards.length;
    el.scrollTo({ left: cardWidth * i, behavior: "smooth" });
  };

  return (
    <section className={`flex flex-col ${className}`}>
      {/* Section header */}
      {(sectionLabel || sectionTitle) && (
        <div className="px-6 pt-6 pb-3 flex-shrink-0">
          {sectionLabel && (
            <p className="font-bebas text-[10px] tracking-[0.3em] text-gold/60 mb-1">
              {sectionLabel}
            </p>
          )}
          {sectionTitle && (
            <h2 className="font-serif text-lg font-bold text-ink">{sectionTitle}</h2>
          )}
        </div>
      )}

      {/* Cards */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-scroll overscroll-x-contain pl-5 pr-5 flex-1"
        style={{
          scrollSnapType: "x mandatory",
          scrollPaddingLeft: "20px",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {cards.map((card) => (
          <div
            key={card.id}
            className="flex-shrink-0 rounded-2xl overflow-hidden"
            style={{
              width: "calc(88vw)",
              scrollSnapAlign: "start",
            }}
          >
            {card.content}
          </div>
        ))}
        {/* Right spacer for peek */}
        <div className="flex-shrink-0 w-4" />
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 py-4 flex-shrink-0">
        {cards.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`rounded-full transition-all duration-300 ${
              i === active
                ? "bg-gold w-4 h-1.5"
                : "bg-ink/20 w-1.5 h-1.5"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
