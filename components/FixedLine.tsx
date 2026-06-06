export default function FixedLine() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-5 py-3 bg-gradient-to-t from-[#050D18] to-transparent">
      <a
        href="https://line.me/R/ti/p/@abesekkotsuin"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2.5 w-full bg-[#06C755] text-white font-medium text-sm py-3.5 rounded-xl tracking-wide shadow-lg"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1C4.134 1 1 3.686 1 7c0 2.066 1.226 3.886 3.09 5.002L3.5 14.5l2.6-1.37C6.68 13.37 7.33 13.5 8 13.5c3.866 0 7-2.686 7-6s-3.134-6-7-6z"
            fill="currentColor"
          />
        </svg>
        LINE で予約・相談する
      </a>
    </div>
  );
}
